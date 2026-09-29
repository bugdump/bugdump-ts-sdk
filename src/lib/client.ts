import type {
  BugdumpConfig,
  BugdumpTheme,
  BugdumpUserContext,
  ReportPayload,
  ReportResponse,
  SubmitOptions,
} from './types';
import { resolveConfig, type ResolvedBugdumpConfig } from './core/config';
import { createInitialState, type SdkState } from './core/state';
import { HttpClient } from './http-client';
import { ConsoleCollector } from './collectors/console';
import { NetworkCollector } from './collectors/network';
import { SessionReplayCollector, SESSION_REPLAY_WINDOW_MS, trimReplayToBudget } from './collectors/session-replay';
import { ReplayPacker } from './collectors/replay-serializer';
import { ActionCollector } from './collectors/action';
import { capturePerformance } from './collectors/performance';
import { captureMetadata } from './collectors/metadata';
import { Widget } from './ui/widget';
import type { Attachment, PanelSubmitData } from './ui/panel';
import { DEFAULT_MAX_MEDIA_SIZE } from './ui/panel-types';
import type { ConsoleLogEntry } from './collectors/console';
import type { NetworkRequestEntry } from './collectors/network';
import type { PerformanceSnapshot } from './collectors/performance';
import type { MetadataSnapshot } from './collectors/metadata';
import { trimPayload } from './core/payload-trimmer';
import type { eventWithTime } from '@rrweb/types';

export interface TelemetrySnapshot {
  consoleLogs: ConsoleLogEntry[];
  networkRequests: NetworkRequestEntry[];
  sessionReplayEvents: eventWithTime[];
  performance: PerformanceSnapshot;
  metadata: MetadataSnapshot;
}

type ReportInput = Omit<PanelSubmitData, 'attachments'> & {
  attachments: Omit<Attachment, 'id'>[];
  priority?: string;
};

type UploadProgressHandler = (current: number, total: number, percent: number) => void;

export class Bugdump {
  private static instance: Bugdump | null = null;

  private state: SdkState;
  private httpClient: HttpClient | null = null;
  private consoleCollector: ConsoleCollector;
  private networkCollector: NetworkCollector;
  private sessionReplayCollector: SessionReplayCollector;
  private actionCollector: ActionCollector;
  private widget: Widget | null = null;

  private constructor() {
    this.state = createInitialState();
    this.consoleCollector = new ConsoleCollector();
    this.networkCollector = new NetworkCollector();
    this.sessionReplayCollector = new SessionReplayCollector();
    this.actionCollector = new ActionCollector();
  }

  private static get isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  static init(config: BugdumpConfig): Bugdump {
    if (Bugdump.instance) {
      return Bugdump.instance;
    }

    const instance = new Bugdump();
    const resolved = resolveConfig(config);

    instance.state.config = resolved;
    instance.state.initialized = true;
    instance.httpClient = new HttpClient(resolved.endpoint, resolved.apiKey);
    instance.consoleCollector = new ConsoleCollector({ filter: resolved.consoleFilter });
    instance.networkCollector = new NetworkCollector({
      captureBodies: resolved.captureNetworkBodies,
      filter: resolved.networkFilter,
    });

    // Published before the collectors and the widget start: they patch globals and touch the
    // DOM, and if either fails the instance must still be reachable so destroy() can unwind it.
    Bugdump.instance = instance;

    if (Bugdump.isBrowser) {
      instance.consoleCollector.start();
      instance.networkCollector.start();
      instance.actionCollector.start();
    }

    instance.mountWidget();

    instance.httpClient
      .fetchConfig()
      .then((widgetConfig) => {
        instance.state.widgetConfig = widgetConfig;
        instance.widget?.setMaxMediaSize(widgetConfig.maxMediaSizePerReport);
        instance.widget?.updateFeatures({
          screenRecording: resolved.features.screenRecording && widgetConfig.features.screenRecording,
        });
        instance.widget?.setRemoveBranding(widgetConfig.features.removeBranding);
        instance.widget?.setPortalUrl(widgetConfig.portalUrl);
        instance.widget?.setDashboardUrl(widgetConfig.dashboardUrl);
        // Replay starts here rather than alongside the other collectors: rrweb is a separate
        // chunk now, so gating on the server's answer keeps it off the wire entirely for
        // accounts whose plan has no session replay. The collector keeps a rolling window,
        // so starting one round trip later costs nothing that a report would have used.
        instance.startSessionReplay(widgetConfig.features.sessionReplay);
      })
      .catch(() => {
        console.warn('[Bugdump] Failed to fetch widget config, using defaults.');
        instance.startSessionReplay(true);
      });

    return instance;
  }

  static getInstance(): Bugdump | null {
    return Bugdump.instance;
  }

  identify(user: BugdumpUserContext): void {
    this.ensureInitialized();
    this.state.user = user;

    if (this.widget) {
      this.widget.setReporterInfo(user.name || '', user.email || '');
    }
  }

  reset(): void {
    this.ensureInitialized();
    this.state.user = null;
    this.state.customContext = {};

    if (this.widget) {
      this.widget.setReporterInfo('', '');
    }
  }

  setContext(context: Record<string, unknown>): void {
    this.ensureInitialized();
    this.state.customContext = { ...this.state.customContext, ...context };
  }

  setTheme(theme: BugdumpTheme): void {
    this.ensureInitialized();
    this.widget?.setTheme(theme);
  }

  open(options?: { taskId?: number }): void {
    this.ensureInitialized();
    if (options?.taskId !== undefined) {
      this.state.activeTaskId = options.taskId;
    }
    this.state.widgetOpen = true;
    this.widget?.openPanel();
  }

  close(): void {
    this.ensureInitialized();
    this.state.widgetOpen = false;
    this.widget?.close();
  }

  identifyTask(taskPublicId: number): void {
    this.ensureInitialized();
    this.state.activeTaskId = taskPublicId;
  }

  clearTask(): void {
    this.ensureInitialized();
    this.state.activeTaskId = null;
  }

  getActiveTaskId(): number | null {
    return this.state.activeTaskId;
  }

  collectTelemetry(): TelemetrySnapshot {
    this.ensureInitialized();
    return {
      consoleLogs: this.consoleCollector.snapshot(),
      networkRequests: this.networkCollector.snapshot(),
      sessionReplayEvents: this.sessionReplayCollector.getSessionReplay(),
      performance: capturePerformance(),
      metadata: captureMetadata(),
    };
  }

  /**
   * Files a report from your own form: the description and fields you pass, plus the same
   * telemetry, context and session replay the widget attaches.
   */
  async submit(options: SubmitOptions): Promise<ReportResponse> {
    this.ensureInitialized();
    if (!Bugdump.isBrowser) {
      throw new Error('Bugdump submit() can only run in a browser.');
    }

    const attachments: ReportInput['attachments'] = (options.files ?? []).map((file) => ({
      type: 'file',
      blob: file,
      name: (file as File).name || 'attachment',
    }));

    const replayEvents = this.sessionReplayCollector.getSessionReplay();
    if (replayEvents.length > 0) {
      const packer = new ReplayPacker();
      const maxBytes = this.state.widgetConfig?.maxMediaSizePerReport ?? DEFAULT_MAX_MEDIA_SIZE;
      const fitted = trimReplayToBudget(replayEvents, maxBytes, (slice) => packer.size(slice));
      if (fitted.length > 0) {
        attachments.push({
          type: 'session_replay',
          blob: packer.serialize(fitted),
          name: `session-replay-${Date.now()}.json`,
        });
      }
    }

    const result = await this.sendReport({
      description: options.description,
      reporterName: options.reporterName ?? '',
      reporterEmail: options.reporterEmail ?? '',
      taskPublicId: options.taskId ?? null,
      priority: options.priority,
      attachments,
      actions: this.actionCollector.getRecentActions(SESSION_REPLAY_WINDOW_MS),
    });
    // A report still being written in the widget panel needs the buffers intact.
    if (!this.widget?.isOpen()) {
      this.flushCollectors();
    }
    return result;
  }

  private flushCollectors(): void {
    this.consoleCollector.flush();
    this.networkCollector.flush();
    this.actionCollector.flush();
  }

  destroy(): void {
    this.httpClient?.abort();
    this.widget?.destroy();
    this.widget = null;
    this.consoleCollector.stop();
    this.networkCollector.stop();
    this.sessionReplayCollector.stop();
    this.actionCollector.stop();
    this.state = createInitialState();
    this.httpClient = null;
    Bugdump.instance = null;
  }

  getConfig(): ResolvedBugdumpConfig | null {
    return this.state.config;
  }

  getUser(): BugdumpUserContext | null {
    return this.state.user;
  }

  getContext(): Record<string, unknown> {
    return this.state.customContext;
  }

  getHttpClient(): HttpClient {
    this.ensureInitialized();
    return this.httpClient!;
  }

  isWidgetOpen(): boolean {
    return this.state.widgetOpen;
  }

  /** Starts the rolling replay recorder when both the local config and the plan allow it. */
  private startSessionReplay(allowedByPlan: boolean): void {
    if (!Bugdump.isBrowser) return;
    if (!this.state.config?.features.sessionReplay || !allowedByPlan) return;
    void this.sessionReplayCollector.start();
  }

  private mountWidget(): void {
    if (typeof document === 'undefined') return;

    const features = this.state.config?.features;
    this.widget = new Widget({
      hideButton: this.state.config?.hideButton,
      position: this.state.config?.position,
      icon: this.state.config?.icon,
      bubbleText: this.state.config?.bubbleText,
      theme: this.state.config?.theme,
      features: features
        ? {
            screenshot: features.screenshot ?? true,
            screenshotMethod: features.screenshotMethod ?? 'dom',
            screenRecording: features.screenRecording ?? true,
            screenRecordingMethod: features.screenRecordingMethod ?? 'dom',
            attachments: features.attachments ?? true,
            allowTaskAttach: features.allowTaskAttach ?? false,
          }
        : undefined,
      translations: this.state.config?.translations,
    });
    this.widget.setOnSubmit((data) => this.handleSubmit(data));
    this.widget.setOnRecordingChange((isRecording) => {
      this.consoleCollector.setRecording(isRecording);
      this.networkCollector.setRecording(isRecording);
      this.actionCollector.setRecording(isRecording);
    });
    this.widget.setSessionReplayCollector(this.sessionReplayCollector);
    this.widget.setActionCollector(this.actionCollector);
    this.widget.setShowReportLink(this.state.config?.showReportLink ?? false);
  }

  private async handleSubmit(data: PanelSubmitData): Promise<ReportResponse> {
    const result = await this.sendReport(data, (current, total, percent) => {
      this.widget?.setUploadProgress(current, total, percent);
    });
    this.flushCollectors();
    return result;
  }

  private async sendReport(data: ReportInput, onUploadProgress?: UploadProgressHandler): Promise<ReportResponse> {
    const httpClient = this.httpClient!;
    const telemetry = this.collectTelemetry();
    const metadata = telemetry.metadata;

    const uploadedAttachments: ReportPayload['attachments'] = [];

    const totalUploads = data.attachments.length;
    let uploadIndex = 0;

    for (const attachment of data.attachments) {
      uploadIndex++;
      const currentIndex = uploadIndex;

      const uploadResponse = await httpClient.requestUpload({
        originalName: attachment.name,
        mimeType: attachment.blob.type || 'application/octet-stream',
        size: attachment.blob.size,
      });

      await httpClient.uploadFileToS3(
        uploadResponse.url,
        uploadResponse.fields,
        attachment.blob,
        onUploadProgress && ((percent) => onUploadProgress(currentIndex, totalUploads, percent)),
      );

      const attachmentMeta = {
        ...(attachment.textAnnotations ? { textAnnotations: attachment.textAnnotations } : {}),
        ...(attachment.metadata ?? {}),
      };

      uploadedAttachments.push({
        fileId: uploadResponse.fileId,
        type: attachment.type,
        metadata: Object.keys(attachmentMeta).length > 0 ? attachmentMeta : undefined,
      });
    }

    const payload: ReportPayload = {
      taskId: data.taskPublicId ?? this.state.activeTaskId ?? undefined,
      description: data.description,
      priority: data.priority,
      reporterName: data.reporterName || this.state.user?.name || undefined,
      reporterEmail: data.reporterEmail || this.state.user?.email || undefined,
      reporterExternalId: this.state.user?.id || undefined,
      pageUrl: metadata.url,
      referrerUrl: metadata.referrer || undefined,
      userAgent: metadata.userAgent,
      viewport: metadata.viewport,
      consoleLogs: telemetry.consoleLogs as unknown as Record<string, unknown>[],
      networkRequests: telemetry.networkRequests as unknown as Record<string, unknown>[],
      actions: data.actions.length > 0 ? data.actions : undefined,
      performance: telemetry.performance as unknown as Record<string, unknown>,
      customContext: Object.keys(this.state.customContext).length > 0 ? this.state.customContext : undefined,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    };

    const { payload: trimmedPayload, info } = trimPayload(payload);
    const telemetryWasTrimmed =
      info.argsTruncated || info.bodiesDropped || info.consoleLogsDropped > 0 || info.networkRequestsDropped > 0;
    if (telemetryWasTrimmed) {
      trimmedPayload.telemetryTrimmed = {
        argsTruncated: info.argsTruncated,
        bodiesDropped: info.bodiesDropped,
        consoleLogsDropped: info.consoleLogsDropped,
        networkRequestsDropped: info.networkRequestsDropped,
      };
    }

    return httpClient.submitReport(trimmedPayload);
  }

  private ensureInitialized(): void {
    if (!this.state.initialized) {
      throw new Error('Bugdump SDK is not initialized. Call Bugdump.init() first.');
    }
  }
}
