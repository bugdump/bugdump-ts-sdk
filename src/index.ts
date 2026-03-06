export { Bugdump } from './lib/client';
export type { TelemetrySnapshot } from './lib/client';
export { BugdumpApiError } from './lib/http-client';
export type { HttpClient } from './lib/http-client';
export type {
  BugdumpConfig,
  BugdumpUserContext,
  ReportPayload,
  ReportResponse,
  UploadRequest,
  UploadResponse,
} from './lib/types';
export type { ConsoleLogEntry } from './lib/collectors/console';
export type { NetworkRequestEntry } from './lib/collectors/network';
export type { PerformanceSnapshot } from './lib/collectors/performance';
export type { MetadataSnapshot } from './lib/collectors/metadata';
export { captureScreenshot } from './lib/capture';
export type { ScreenshotOptions, ScreenshotResult } from './lib/capture';
export { AnnotationOverlay, renderOperationsToCanvas } from './lib/capture';
export type {
  AnnotationTool,
  Point,
  DrawOperation,
  ArrowOperation,
  BoxOperation,
  TextOperation,
  BlurOperation,
  FreehandOperation,
} from './lib/capture';
export type { Attachment, PanelSubmitData } from './lib/ui/panel';
