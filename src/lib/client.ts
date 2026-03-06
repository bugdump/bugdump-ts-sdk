import type { BugdumpConfig, BugdumpUserContext, ReportPayload } from './types';
import { resolveConfig } from './core/config';
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

  static init(config: BugdumpConfig): Bugdump {
    if (Bugdump.instance) {
      return Bugdump.instance;
    }

    const instance = new Bugdump();
    const resolved = resolveConfig(config);

    instance.state.config = resolved;
    instance.state.initialized = true;
    instance.httpClient = new HttpClient(resolved.endpoint, resolved.projectKey);

    instance.consoleCollector.start();
    instance.networkCollector.start();
    instance.sessionReplayCollector.start();

    instance.mountWidget();

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

  setContext(context: Record<string, unknown>): void {
    this.ensureInitialized();
    this.state.customContext = { ...this.state.customContext, ...context };
  }

  open(): void {
    this.ensureInitialized();
    this.state.widgetOpen = true;
    this.widget?.openPanel();
  }

  close(): void {
    this.ensureInitialized();
    this.state.widgetOpen = false;
    this.widget?.close();
  }

  collectTelemetry(): TelemetrySnapshot {
    this.ensureInitialized();
    return {
      consoleLogs: this.consoleCollector.flush(),
      networkRequests: this.networkCollector.flush(),
      sessionReplayEvents: this.sessionReplayCollector.flush(),
      performance: capturePerformance(),
      metadata: captureMetadata(),
    };
  }

  destroy(): void {
    this.widget?.destroy();
    this.widget = null;
    this.consoleCollector.stop();
    this.networkCollector.stop();
    this.sessionReplayCollector.stop();
    this.state = createInitialState();
    this.httpClient = null;
    Bugdump.instance = null;
  }

  getConfig(): Required<BugdumpConfig> | null {
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

    this.widget = new Widget();
    this.widget.setOnSubmit((data) => this.handleSubmit(data));
  }

  private async handleSubmit(data: PanelSubmitData): Promise<void> {
    const httpClient = this.httpClient!;
    const telemetry = this.collectTelemetry();
    const metadata = telemetry.metadata;

    const uploadedAttachments: ReportPayload['attachments'] = [];

    for (const attachment of data.attachments) {
      const uploadResponse = await httpClient.requestUpload({
        originalName: attachment.name,
        mimeType: attachment.blob.type,
        size: attachment.blob.size,
      });

      await httpClient.uploadFileToS3(uploadResponse.url, uploadResponse.fields, attachment.blob);

      const attType = attachment.type === 'file' ? 'screenshot' : attachment.type;
      uploadedAttachments.push({
        fileId: uploadResponse.fileId,
        type: attType as 'screenshot' | 'recording' | 'voice_note' | 'session_replay',
        metadata: attachment.annotations ? { annotations: attachment.annotations } : undefined,
      });
    }

    const payload: ReportPayload = {
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

    await httpClient.submitReport(payload);
  }

  private ensureInitialized(): void {
    if (!this.state.initialized) {
      throw new Error('Bugdump SDK is not initialized. Call Bugdump.init() first.');
    }
  }
}
