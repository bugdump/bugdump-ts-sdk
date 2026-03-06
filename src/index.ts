import { Bugdump } from './lib/client';
export { Bugdump };
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

// Auto-init: detect <script data-project="..."> and initialize automatically
if (typeof document !== 'undefined') {
  const currentScript =
    document.currentScript ||
    (() => {
      const scripts = document.querySelectorAll('script[data-project]');
      return scripts[scripts.length - 1] as HTMLScriptElement | null;
    })();

  if (currentScript) {
    const projectKey = (currentScript as HTMLElement).getAttribute('data-project');
    const endpoint = (currentScript as HTMLElement).getAttribute('data-endpoint');

    if (projectKey) {
      Bugdump.init({
        projectKey,
        ...(endpoint && { endpoint }),
      });
    }
  }
}
