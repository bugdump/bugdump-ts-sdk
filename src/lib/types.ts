export type CaptureMethod = 'dom' | 'screen-capture';

export interface BugdumpFeatures {
  screenshot?: boolean;
  screenshotMethod?: CaptureMethod;
  screenRecording?: boolean;
  screenRecordingMethod?: CaptureMethod;
  sessionReplay?: boolean;
  attachments?: boolean;
}

export type BugdumpTheme = 'light' | 'dark' | 'auto';

export interface BugdumpTranslations {
  title?: string;
  descriptionPlaceholder?: string;
  attachButton?: string;
  screenshotButton?: string;
  recordButton?: string;
  sendButton?: string;
  reporterToggle?: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  capturing?: string;
  stop?: string;
  sending?: string;
  successTitle?: string;
  successSubtitle?: string;
  errorMessage?: string;
  arrowTool?: string;
  rectangleTool?: string;
  drawTool?: string;
  textTool?: string;
  blurTool?: string;
  undo?: string;
  cancel?: string;
  done?: string;
}

export interface BugdumpConfig {
  apiKey: string;
  endpoint?: string;
  captureNetworkBodies?: boolean;
  hideButton?: boolean;
  theme?: BugdumpTheme;
  features?: BugdumpFeatures;
  translations?: BugdumpTranslations;
}

export interface BugdumpUserContext {
  id?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ReportPayload {
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
  textAnnotations?: Array<{ text: string; x: number; y: number }>;
  attachments?: Array<{
    fileId: string;
    type: 'screenshot' | 'recording' | 'voice_note' | 'session_replay';
    metadata?: Record<string, unknown>;
  }>;
}

export interface ReportResponse {
  id: string;
  publicId: string;
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
}

export interface HttpErrorResponse {
  error: string;
  details?: unknown;
}
