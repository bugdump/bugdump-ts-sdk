import { Bugdump } from './lib/client';
export { Bugdump };
export type { TelemetrySnapshot } from './lib/client';
export { BugdumpApiError } from './lib/http-client';
export type { HttpClient } from './lib/http-client';
export type {
  BugdumpConfig,
  BugdumpTheme,
  BugdumpTranslations,
  BugdumpUserContext,
  CaptureMethod,
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

// Auto-init: detect <script data-api-key="..."> and initialize automatically
if (typeof document !== 'undefined') {
  console.debug('[Bugdump] Auto-init: checking for script tag with data-api-key');

  const currentScript =
    document.currentScript ||
    (() => {
      const scripts = document.querySelectorAll('script[data-api-key]');
      console.debug(`[Bugdump] document.currentScript not available, found ${scripts.length} script(s) with data-api-key`);
      return scripts[scripts.length - 1] as HTMLScriptElement | null;
    })();

  if (currentScript) {
    const el = currentScript as HTMLElement;
    const projectKey = el.getAttribute('data-api-key');
    const endpoint = el.getAttribute('data-api-url');
    const captureNetworkBodies = el.getAttribute('data-capture-network-bodies') === 'true';
    const hideButton = el.getAttribute('data-hide-button') === 'true';
    const theme = el.getAttribute('data-theme') as 'light' | 'dark' | 'auto' | null;

    const features: Record<string, boolean | string> = {};
    if (el.hasAttribute('data-screenshot')) features.screenshot = el.getAttribute('data-screenshot') !== 'false';
    if (el.hasAttribute('data-screenshot-method')) features.screenshotMethod = el.getAttribute('data-screenshot-method') || 'dom';
    if (el.hasAttribute('data-screen-recording')) features.screenRecording = el.getAttribute('data-screen-recording') !== 'false';
    if (el.hasAttribute('data-screen-recording-method')) features.screenRecordingMethod = el.getAttribute('data-screen-recording-method') || 'dom';
    if (el.hasAttribute('data-session-replay')) features.sessionReplay = el.getAttribute('data-session-replay') !== 'false';
    if (el.hasAttribute('data-attachments')) features.attachments = el.getAttribute('data-attachments') !== 'false';

    let translations: Record<string, string> | undefined;
    const translationsAttr = el.getAttribute('data-translations');
    if (translationsAttr) {
      try {
        translations = JSON.parse(translationsAttr);
      } catch {
        console.warn('[Bugdump] Auto-init: invalid data-translations JSON, ignoring.');
      }
    }

    console.debug('[Bugdump] Auto-init config:', {
      projectKey: projectKey ? `${projectKey.slice(0, 8)}…` : null,
      endpoint: endpoint || '(default)',
      captureNetworkBodies,
      hideButton,
      theme: theme || '(default)',
      features,
    });

    if (projectKey) {
      Bugdump.init({
        projectKey,
        ...(endpoint && { endpoint }),
        ...(captureNetworkBodies && { captureNetworkBodies }),
        ...(hideButton && { hideButton }),
        ...(theme && { theme }),
        ...(Object.keys(features).length > 0 && { features }),
        ...(translations && { translations }),
      });
      console.debug('[Bugdump] Auto-init: initialized successfully');
    } else {
      console.warn('[Bugdump] Auto-init: script tag found but data-api-key is empty');
    }
  } else {
    console.debug('[Bugdump] Auto-init: no script tag with data-api-key found, skipping');
  }
}
