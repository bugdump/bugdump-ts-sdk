export interface BugdumpConfig {
  projectKey: string;
  endpoint?: string;
  captureNetworkBodies?: boolean;
  hideButton?: boolean;
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

export interface HttpErrorResponse {
  error: string;
  details?: unknown;
}
