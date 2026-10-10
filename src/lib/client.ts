import type {
  BugdumpConfig,
  BugdumpErrorEvent,
  BugdumpTheme,
  BugdumpUserContext,
  ErrorEventPayload,
  ReportPayload,
  ReportResponse,
  SubmitOptions,
} from './types';
import { resolveConfig, type ResolvedBugdumpConfig } from './core/config';
import { createInitialState, type SdkState } from './core/state';
import { HTML2CANVAS_CHUNK, REPLAY_CHUNK, scriptBaseUrl } from './core/chunk-loader';
import { getDebugIdsForStack } from './core/debug-ids';
import { createUuid } from './core/uuid';
import { BugdumpApiError, HttpClient } from './http-client';
import { ConsoleCollector } from './collectors/console';
import { NetworkCollector } from './collectors/network';
import { ErrorCollector, type CapturedErrorDetails } from './collectors/error';
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
import { trimPayload, type TrimInfo } from './core/payload-trimmer';
import type { eventWithTime } from '@rrweb/types';

const ERROR_MESSAGE_MAX_LENGTH = 2_000;
const ERROR_STACK_MAX_LENGTH = 32_000;
const ERROR_CONSOLE_LOGS = 100;
const ERROR_NETWORK_REQUESTS = 50;
const ERROR_ACTIONS = 200;
const ERROR_ACTIONS_WINDOW_MS = 60_000;
// Under the error route's 256 KB body limit.
const ERROR_EVENT_MAX_BYTES = 200 * 1024;

export interface TelemetrySnapshot {
  consoleLogs: ConsoleLogEntry[];
  networkRequests: NetworkRequestEntry[];
  sessionReplayEvents: eventWithTime[];
  performance: PerformanceSnapshot;
  metadata: MetadataSnapshot;
}

type ReportInput = Omit<PanelSubmitData, 'attachments'> & {
  attachments: (Omit<Attachment, 'id'> & { id?: string })[];
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
  private errorCollector: ErrorCollector | null = null;
  private widget: Widget | null = null;
  /**
   * Uploaded file id per panel attachment blob, so a resent report neither presigns nor uploads a
   * file again. Keyed by the blob, because annotating a screenshot replaces it under the same id.
   */
  private uploadedFileIds = new WeakMap<Blob, string>();

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
      endpoint: resolved.endpoint,
    });
    const errorCollector = new ErrorCollector({
      sampleRate: resolved.sampleRate,
      ignoreErrors: resolved.ignoreErrors,
      sdkFiles: getSdkFileUrls(),
      onCapture: (error, context) => void instance.sendErrorEvent(error, context),
    });
    instance.errorCollector = errorCollector;

    // Published before the collectors and the widget start: they patch globals and touch the
    // DOM, and if either fails the instance must still be reachable so destroy() can unwind it.
    Bugdump.instance = instance;

    if (Bugdump.isBrowser) {
      instance.consoleCollector.start();
      instance.networkCollector.start();
      instance.actionCollector.start();
      if (resolved.captureErrors) errorCollector.start();
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
        if (widgetConfig.acceptingReports === false) instance.widget?.setAcceptingReports(false);
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
    if (!this.state.initialized) return;
    this.state.user = user;

    if (this.widget) {
      this.widget.setReporterInfo(user.name || '', user.email || '');
    }
  }

  reset(): void {
    if (!this.state.initialized) return;
    this.state.user = null;
    this.state.customContext = {};

    if (this.widget) {
      this.widget.setReporterInfo('', '');
    }
  }

  setContext(context: Record<string, unknown>): void {
    if (!this.state.initialized) return;
    this.state.customContext = { ...this.state.customContext, ...context };
  }

  /**
   * Sends an error you caught yourself, marked handled. `options.context` is merged over the
   * `setContext()` data for this event only. Never throws.
   */
  captureException(error: unknown, options?: { context?: Record<string, unknown> }): void {
    if (!this.state.initialized || !this.errorCollector) {
      console.warn('[Bugdump] captureException ignored: call Bugdump.init() first.');
      return;
    }
    // Callers include error boundaries, which must not fail again inside their own handler.
    try {
      this.errorCollector.captureException(error, options?.context);
    } catch (captureError) {
      console.warn('[Bugdump] captureException failed:', captureError);
    }
  }

  setTheme(theme: BugdumpTheme): void {
    if (!this.state.initialized) return;
    this.widget?.setTheme(theme);
  }

  open(options?: { taskId?: number }): void {
    if (!this.state.initialized) return;
    if (options?.taskId !== undefined) {
      this.state.activeTaskId = options.taskId;
    }
    this.state.widgetOpen = true;
    this.widget?.openPanel();
  }

  close(): void {
    if (!this.state.initialized) return;
    this.state.widgetOpen = false;
    this.widget?.close();
  }

  identifyTask(taskPublicId: number): void {
    if (!this.state.initialized) return;
    this.state.activeTaskId = taskPublicId;
  }

  clearTask(): void {
    if (!this.state.initialized) return;
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
      clientReportId: createUuid(),
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
    if (!this.state.initialized) return;
    this.httpClient?.abort();
    this.widget?.destroy();
    this.widget = null;
    this.consoleCollector.stop();
    this.networkCollector.stop();
    this.sessionReplayCollector.stop();
    this.actionCollector.stop();
    this.errorCollector?.stop();
    this.errorCollector = null;
    this.state = createInitialState();
    this.httpClient = null;
    // A stale instance destroyed after a new init() must not orphan the live one.
    if (Bugdump.instance === this) Bugdump.instance = null;
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
    this.sessionReplayCollector.start().catch((error: unknown) => {
      console.warn('[Bugdump] Session replay could not start:', error);
    });
  }

  private mountWidget(): void {
    if (typeof document === 'undefined') return;

    const features = this.state.config?.features;
    this.widget = new Widget({
      hideButton: this.state.config?.hideButton,
      position: this.state.config?.position,
      locale: this.state.config?.locale,
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

      let fileId = attachment.id ? this.uploadedFileIds.get(attachment.blob) : undefined;
      if (!fileId) {
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

        fileId = uploadResponse.fileId;
        if (attachment.id) this.uploadedFileIds.set(attachment.blob, fileId);
      }

      const attachmentMeta = {
        ...(attachment.textAnnotations ? { textAnnotations: attachment.textAnnotations } : {}),
        ...(attachment.metadata ?? {}),
      };

      uploadedAttachments.push({
        fileId,
        type: attachment.type,
        metadata: Object.keys(attachmentMeta).length > 0 ? attachmentMeta : undefined,
      });
    }

    const payload: ReportPayload = {
      clientReportId: data.clientReportId,
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
    trimmedPayload.telemetryTrimmed = describeTrimming(info);

    const result = await httpClient.submitReport(trimmedPayload);
    for (const attachment of data.attachments) {
      this.uploadedFileIds.delete(attachment.blob);
    }
    return result;
  }

  /** Sends one captured error. Swallows its own failures, so a failed send is never captured as an error. */
  private async sendErrorEvent(error: CapturedErrorDetails, context?: Record<string, unknown>): Promise<void> {
    try {
      const config = this.state.config;
      const httpClient = this.httpClient;
      if (!config || !httpClient) return;

      const customContext = { ...this.state.customContext, ...context };
      const event = applyBeforeSend(
        {
          eventId: createUuid(),
          occurredAt: Date.now(),
          release: config.release,
          error: {
            ...error,
            message: error.message.slice(0, ERROR_MESSAGE_MAX_LENGTH),
            stack: error.stack?.slice(0, ERROR_STACK_MAX_LENGTH),
          },
          customContext: Object.keys(customContext).length > 0 ? customContext : undefined,
        },
        config.beforeSend,
      );
      if (!event) return;

      const metadata = captureMetadata();
      const user = this.state.user;
      const debugIds = getDebugIdsForStack(event.error.stack, event.error.filename);
      const actions = this.actionCollector.getRecentActions(ERROR_ACTIONS_WINDOW_MS).slice(-ERROR_ACTIONS);
      const payload: ErrorEventPayload = {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        release: event.release,
        debugIds: Object.keys(debugIds).length > 0 ? debugIds : undefined,
        error: event.error,
        reporterName: user?.name || undefined,
        reporterEmail: user?.email || undefined,
        reporterExternalId: user?.id || undefined,
        pageUrl: metadata.url,
        referrerUrl: metadata.referrer || undefined,
        userAgent: metadata.userAgent,
        viewport: metadata.viewport,
        // Copies, because trimming rewrites entries in place and the buffers still serve later reports.
        consoleLogs: this.consoleCollector
          .snapshot()
          .slice(-ERROR_CONSOLE_LOGS)
          .map((entry) => ({ ...entry })),
        networkRequests: this.networkCollector
          .snapshot()
          .slice(-ERROR_NETWORK_REQUESTS)
          .map((entry) => ({ ...entry })),
        actions: actions.length > 0 ? actions : undefined,
        performance: capturePerformance() as unknown as Record<string, unknown>,
        customContext: event.customContext,
      };

      const { payload: trimmedPayload, info } = trimPayload(payload, ERROR_EVENT_MAX_BYTES, 'utf8');
      trimmedPayload.telemetryTrimmed = describeTrimming(info);

      await httpClient.submitErrorEvent(trimmedPayload);
    } catch (sendError) {
      if (stopsErrorCapture(sendError)) this.errorCollector?.halt();
    }
  }

  // Only for the methods that return something. The fire-and-forget ones return early instead,
  // because cleanups (React effects among them) can still reach an instance after destroy().
  private ensureInitialized(): void {
    if (!this.state.initialized) {
      throw new Error('This Bugdump instance was destroyed.');
    }
  }
}

function describeTrimming(info: TrimInfo): ReportPayload['telemetryTrimmed'] {
  const telemetryWasTrimmed =
    info.argsTruncated || info.bodiesDropped || info.consoleLogsDropped > 0 || info.networkRequestsDropped > 0;
  if (!telemetryWasTrimmed) return undefined;
  return {
    argsTruncated: info.argsTruncated,
    bodiesDropped: info.bodiesDropped,
    consoleLogsDropped: info.consoleLogsDropped,
    networkRequestsDropped: info.networkRequestsDropped,
  };
}

/** A throw in the hook sends the event as it was, so the copy it gets keeps the original intact. */
function applyBeforeSend(
  event: BugdumpErrorEvent,
  beforeSend: ResolvedBugdumpConfig['beforeSend'],
): BugdumpErrorEvent | null {
  if (!beforeSend) return event;
  try {
    return beforeSend({
      ...event,
      error: { ...event.error },
      customContext: event.customContext && { ...event.customContext },
    });
  } catch (hookError) {
    console.warn('[Bugdump] beforeSend threw, so the error event is sent unchanged:', hookError);
    return event;
  }
}

function stopsErrorCapture(error: unknown): boolean {
  return (
    error instanceof BugdumpApiError &&
    error.statusCode === 403 &&
    (error.code === 'ERROR_CAPTURE_DISABLED' || error.code === 'ERROR_QUOTA_EXCEEDED')
  );
}

/** The SDK's own script and chunk URLs, so errors thrown only in them are dropped. The npm build has none. */
function getSdkFileUrls(): string[] {
  if (!__BUGDUMP_IIFE__ || !scriptBaseUrl) return [];
  return [
    scriptBaseUrl,
    ...[REPLAY_CHUNK, HTML2CANVAS_CHUNK].map((chunk) => new URL(`./${chunk}`, scriptBaseUrl).href),
  ];
}
