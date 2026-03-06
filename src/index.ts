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
export type { Attachment, TextAnnotationMeta, PanelSubmitData } from './lib/ui/panel';

// Auto-init: detect <script data-api-key="..."> and initialize automatically
if (typeof document !== 'undefined') {
  const currentScript =
    document.currentScript ||
    (() => {
      const scripts = document.querySelectorAll('script[data-api-key]');
      return scripts[scripts.length - 1] as HTMLScriptElement | null;
    })();

  if (currentScript) {
    const el = currentScript as HTMLElement;
    const projectKey = el.getAttribute('data-api-key');
    const endpoint = el.getAttribute('data-api-url');
    const captureNetworkBodies = el.getAttribute('data-capture-network-bodies') === 'true';
    const hideButton = el.getAttribute('data-hide-button') === 'true';

    if (projectKey) {
      Bugdump.init({
        projectKey,
        ...(endpoint && { endpoint }),
        ...(captureNetworkBodies && { captureNetworkBodies }),
        ...(hideButton && { hideButton }),
      });
    }
  }
}
