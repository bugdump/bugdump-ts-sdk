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

export type BugdumpPosition = 'bottom-right' | 'bottom-left';

export type BugdumpLocale = 'en' | 'ru' | 'es' | 'fr' | 'pt' | 'de';

export interface BugdumpTranslations {
  title?: string;
  triggerTitle?: string;
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
  emptyDescriptionMessage?: string;
  quotaExceededMessage?: string;
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
  minimizePanel?: string;
  closePanel?: string;
  toggleMicrophone?: string;
  selectMicrophone?: string;
  microphone?: string;
  colorRed?: string;
  colorYellow?: string;
  colorGreen?: string;
  colorBlue?: string;
  colorWhite?: string;
  removeAttachment?: string;
  uploading?: string;
  viewReports?: string;
  poweredBy?: string;
  dismissBubble?: string;
  textPlaceholder?: string;
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
  position?: BugdumpPosition;
  locale?: 'auto' | BugdumpLocale | (string & {});
  icon?: string;
  bubbleText?: string;
  features?: BugdumpFeatures;
  translations?: BugdumpTranslations;
  consoleFilter?: ConsoleFilterOptions;
  networkFilter?: NetworkFilterOptions;
  /** Send uncaught errors and unhandled promise rejections automatically. Defaults to `true`. */
  captureErrors?: boolean;
  /** Your build's version, such as a git commit. An error that comes back in a new release reopens its task. */
  release?: string;
  /** Share of automatically captured errors to send, from 0 to 1. Defaults to `1`. Never applies to `captureException`. */
  sampleRate?: number;
  /** Automatically captured errors whose `type: message` matches one of these are not sent. Strings match as substrings. */
  ignoreErrors?: Array<string | RegExp>;
  /** Called before an error event is sent. Return the event, changed or not, to send it, or `null` to drop it. */
  beforeSend?: (event: BugdumpErrorEvent) => BugdumpErrorEvent | null;
}

export type ErrorMechanism = 'onerror' | 'unhandledrejection' | 'manual';

export interface BugdumpErrorEvent {
  eventId: string;
  occurredAt: number;
  release?: string;
  error: {
    type: string;
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    mechanism: ErrorMechanism;
    handled: boolean;
  };
  customContext?: Record<string, unknown>;
}

export interface ErrorEventPayload {
  eventId: string;
  occurredAt: number;
  release?: string;
  /** Script URL to debug ID, for the files in the error's stack. */
  debugIds?: Record<string, string>;
  error: BugdumpErrorEvent['error'];
  reporterName?: string;
  reporterEmail?: string;
  reporterExternalId?: string;
  pageUrl?: string;
  referrerUrl?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  consoleLogs?: Record<string, unknown>[];
  networkRequests?: Record<string, unknown>[];
  actions?: UserAction[];
  performance?: Record<string, unknown>;
  customContext?: Record<string, unknown>;
  telemetryTrimmed?: ReportPayload['telemetryTrimmed'];
}

export interface BugdumpUserContext {
  id?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export type UserActionKind = 'click' | 'type' | 'toggle' | 'select' | 'submit' | 'navigate';

export interface UserAction {
  kind: UserActionKind;
  ts: number;
  selector?: string;
  value?: string;
  checked?: boolean;
  masked?: boolean;
  url?: string;
}

export interface ReportPayload {
  /** A uuid per report. A resend with the same id gets the first result instead of a second task. */
  clientReportId?: string;
  taskId?: number;
  description: string;
  /** A priority option label as the project defines it, e.g. "High". Matched case-insensitively; one the project does not have is ignored and the report is still filed. */
  priority?: string;
  reporterName?: string;
  reporterEmail?: string;
  reporterExternalId?: string;
  pageUrl?: string;
  referrerUrl?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  consoleLogs?: Record<string, unknown>[];
  networkRequests?: Record<string, unknown>[];
  actions?: UserAction[];
  performance?: Record<string, unknown>;
  customContext?: Record<string, unknown>;
  telemetryTrimmed?: {
    argsTruncated: boolean;
    bodiesDropped: boolean;
    consoleLogsDropped: number;
    networkRequestsDropped: number;
  };
  textAnnotations?: Array<{ text: string }>;
  attachments?: Array<{
    fileId: string;
    type: 'screenshot' | 'recording' | 'voice_note' | 'session_replay' | 'file';
    metadata?: Record<string, unknown>;
  }>;
}

export interface SubmitOptions {
  description: string;
  /** Falls back to the name passed to `identify()`. */
  reporterName?: string;
  /** Falls back to the email passed to `identify()`. */
  reporterEmail?: string;
  /** A priority option label as the project defines it, e.g. "High". Matched case-insensitively; one the project does not have is ignored and the report is still filed. */
  priority?: string;
  /** Public ID of an existing task to attach the report to. Falls back to `identifyTask()` / `open({ taskId })`. */
  taskId?: number;
  /** Uploaded as file attachments. A `File` keeps its name; a plain `Blob` is named "attachment". */
  files?: Blob[];
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
  acceptingReports: boolean;
  portalUrl?: string | null;
  dashboardUrl?: string | null;
}

export interface HttpErrorResponse {
  error: string;
  details?: unknown;
}
