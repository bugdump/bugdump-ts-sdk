import type { BugdumpConfig, BugdumpUserContext, ReportPayload, ReportResponse } from './types';
import { resolveConfig, type ResolvedBugdumpConfig } from './core/config';
import { createInitialState, type SdkState } from './core/state';
import { HttpClient } from './http-client';
import { ConsoleCollector } from './collectors/console';
import { NetworkCollector } from './collectors/network';
import { SessionReplayCollector } from './collectors/session-replay';
import { capturePerformance } from './collectors/performance';
import { captureMetadata } from './collectors/metadata';
import { Widget } from './ui/widget';
import type { PanelSubmitData } from './ui/panel';
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

export class Bugdump {
  private static instance: Bugdump | null = null;

  private state: SdkState;
  private httpClient: HttpClient | null = null;
  private consoleCollector: ConsoleCollector;
  private networkCollector: NetworkCollector;
  private sessionReplayCollector: SessionReplayCollector;
  private widget: Widget | null = null;

  private constructor() {
    this.state = createInitialState();
    this.consoleCollector = new ConsoleCollector();
    this.networkCollector = new NetworkCollector();
    this.sessionReplayCollector = new SessionReplayCollector();
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

    if (Bugdump.isBrowser) {
      instance.consoleCollector.start();
      instance.networkCollector.start();
      if (resolved.features.sessionReplay) {
        instance.sessionReplayCollector.start();
      }
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
        if (!widgetConfig.features.sessionReplay) {
          instance.sessionReplayCollector.stop();
        }
      })
      .catch(() => {
        console.warn('[Bugdump] Failed to fetch widget config, using defaults.');
      });

    Bugdump.instance = instance;
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

  private flushCollectors(): void {
    this.consoleCollector.flush();
    this.networkCollector.flush();
  }

  destroy(): void {
    this.httpClient?.abort();
    this.widget?.destroy();
    this.widget = null;
    this.consoleCollector.stop();
    this.networkCollector.stop();
    this.sessionReplayCollector.stop();
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

  private mountWidget(): void {
    if (typeof document === 'undefined') return;

    const features = this.state.config?.features;
    this.widget = new Widget({
      hideButton: this.state.config?.hideButton,
      icon: this.state.config?.icon,
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
    this.widget.setSessionReplayCollector(this.sessionReplayCollector);
    this.widget.setShowReportLink(this.state.config?.showReportLink ?? false);
  }

  private async handleSubmit(data: PanelSubmitData): Promise<ReportResponse> {
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
        mimeType: attachment.blob.type,
        size: attachment.blob.size,
      });

      await httpClient.uploadFileToS3(uploadResponse.url, uploadResponse.fields, attachment.blob, (percent) => {
        this.widget?.setUploadProgress(currentIndex, totalUploads, percent);
      });

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
      reporterName: data.reporterName || this.state.user?.name || undefined,
      reporterEmail: data.reporterEmail || this.state.user?.email || undefined,
      reporterExternalId: this.state.user?.id || undefined,
      pageUrl: metadata.url,
      referrerUrl: metadata.referrer || undefined,
      userAgent: metadata.userAgent,
      viewport: metadata.viewport,
      consoleLogs: telemetry.consoleLogs as unknown as Record<string, unknown>[],
      networkRequests: telemetry.networkRequests as unknown as Record<string, unknown>[],
      performance: telemetry.performance as unknown as Record<string, unknown>,
      customContext: Object.keys(this.state.customContext).length > 0 ? this.state.customContext : undefined,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    };

    const result = await httpClient.submitReport(trimPayload(payload));
    this.flushCollectors();
    return result;
  }

  private ensureInitialized(): void {
    if (!this.state.initialized) {
      throw new Error('Bugdump SDK is not initialized. Call Bugdump.init() first.');
    }
  }
}
