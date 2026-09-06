import { Bugdump } from './lib/client';
import { runAutoInit } from './lib/auto-init';
export { Bugdump };
export type { TelemetrySnapshot } from './lib/client';
export { BugdumpApiError, HttpClient } from './lib/http-client';
export type {
  BugdumpConfig,
  BugdumpPosition,
  BugdumpTheme,
  BugdumpTranslations,
  BugdumpUserContext,
  CaptureMethod,
  ConsoleFilterEntry,
  ConsoleFilterOptions,
  ConsoleLogLevel,
  NetworkFilterEntry,
  NetworkFilterOptions,
  ReportPayload,
  ReportResponse,
  UploadRequest,
  UploadResponse,
} from './lib/types';
export type { ConsoleLogEntry } from './lib/collectors/console';
export type { NetworkRequestEntry } from './lib/collectors/network';
export type { PerformanceSnapshot } from './lib/collectors/performance';
export type { MetadataSnapshot } from './lib/collectors/metadata';
export { captureScreenshot, captureScreenshotNative } from './lib/capture';
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
export type { Attachment, TextAnnotationMeta, PanelSubmitData } from './lib/ui/panel';

runAutoInit();
