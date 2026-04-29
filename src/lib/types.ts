export type CaptureMethod = 'dom' | 'screen-capture';

export interface BugdumpFeatures {
  screenshot?: boolean;
  screenshotMethod?: CaptureMethod;
  screenRecording?: boolean;
  screenRecordingMethod?: CaptureMethod;
  sessionReplay?: boolean;
  attachments?: boolean;
  allowTaskAttach?: boolean;
}

export type BugdumpTheme = 'light' | 'dark' | 'auto';

export interface BugdumpTranslations {
  title?: string;
  descriptionPlaceholder?: string;
  attachButton?: string;
  screenshotButton?: string;
  recordButton?: string;
  startRecording?: string;
  sendButton?: string;
  reporterToggle?: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  taskAttachToggle?: string;
  taskIdPlaceholder?: string;
  capturing?: string;
  stop?: string;
  sending?: string;
  successTitle?: string;
  successSubtitle?: string;
  errorMessage?: string;
  recordingEmptyError?: string;
  arrowTool?: string;
  rectangleTool?: string;
  drawTool?: string;
  textTool?: string;
  blurTool?: string;
  undo?: string;
  cancel?: string;
  done?: string;
  badgeScreenshot?: string;
  badgeRecording?: string;
  badgeReplay?: string;
  badgeVoiceNote?: string;
  copyLink?: string;
  copied?: string;
  closeButton?: string;
  submitAnother?: string;
}

export type BugdumpIcon = 'bug' | 'chat' | 'feedback' | 'lightning';

export type ConsoleLogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface ConsoleFilterEntry {
  level: ConsoleLogLevel;
  args: unknown[];
  timestamp: number;
}

export interface NetworkFilterEntry {
  method: string;
  url: string;
  status: number | null;
  statusText: string | null;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  duration: number | null;
  startedAt: number;
  error: string | null;
}

export interface ConsoleFilterOptions {
  levels?: ConsoleLogLevel[];
  exclude?: Array<string | RegExp>;
  filter?: (entry: ConsoleFilterEntry) => boolean;
}

export interface NetworkFilterOptions {
  excludeUrls?: Array<string | RegExp>;
  includeUrls?: Array<string | RegExp>;
  excludeMethods?: string[];
  filter?: (entry: NetworkFilterEntry) => boolean;
}

export interface BugdumpConfig {
  apiKey: string;
  endpoint?: string;
  captureNetworkBodies?: boolean;
  hideButton?: boolean;
  showReportLink?: boolean;
  theme?: BugdumpTheme;
  icon?: string;
  features?: BugdumpFeatures;
  translations?: BugdumpTranslations;
  consoleFilter?: ConsoleFilterOptions;
  networkFilter?: NetworkFilterOptions;
}

export interface BugdumpUserContext {
  id?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ReportPayload {
  taskId?: number;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  reporterName?: string;
  reporterEmail?: string;
  reporterExternalId?: string;
  pageUrl?: string;
  referrerUrl?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  consoleLogs?: Record<string, unknown>[];
  networkRequests?: Record<string, unknown>[];
  performance?: Record<string, unknown>;
  customContext?: Record<string, unknown>;
  textAnnotations?: Array<{ text: string }>;
  attachments?: Array<{
    fileId: string;
    type: 'screenshot' | 'recording' | 'voice_note' | 'session_replay' | 'file';
    metadata?: Record<string, unknown>;
  }>;
}

export interface ReportResponse {
  id: string;
  taskId: string;
  taskPublicId: number;
}

export interface UploadRequest {
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadResponse {
  fileId: string;
  url: string;
  fields: Record<string, string>;
}

export interface WidgetConfig {
  maxMediaSizePerReport: number;
  features: {
    sessionReplay: boolean;
    screenRecording: boolean;
    removeBranding: boolean;
  };
  portalUrl?: string | null;
  dashboardUrl?: string | null;
}

export interface HttpErrorResponse {
  error: string;
  details?: unknown;
}
