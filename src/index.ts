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
    const apiKey = el.getAttribute('data-api-key');
    const endpoint = el.getAttribute('data-api-url');
    const captureNetworkBodies = el.getAttribute('data-capture-network-bodies') === 'true';
    const hideButton = el.getAttribute('data-hide-button') === 'true';
    const showReportLink = el.getAttribute('data-show-report-link') === 'true';
    const theme = el.getAttribute('data-theme') as 'light' | 'dark' | 'auto' | null;
    const icon = el.getAttribute('data-icon');

    const features: Record<string, boolean | string> = {};
    if (el.hasAttribute('data-screenshot')) features.screenshot = el.getAttribute('data-screenshot') !== 'false';
    if (el.hasAttribute('data-screenshot-method')) features.screenshotMethod = el.getAttribute('data-screenshot-method') || 'dom';
    if (el.hasAttribute('data-screen-recording')) features.screenRecording = el.getAttribute('data-screen-recording') !== 'false';
    if (el.hasAttribute('data-screen-recording-method')) features.screenRecordingMethod = el.getAttribute('data-screen-recording-method') || 'dom';
    if (el.hasAttribute('data-session-replay')) features.sessionReplay = el.getAttribute('data-session-replay') !== 'false';
    if (el.hasAttribute('data-attachments')) features.attachments = el.getAttribute('data-attachments') !== 'false';
    if (el.hasAttribute('data-allow-task-attach')) features.allowTaskAttach = el.getAttribute('data-allow-task-attach') !== 'false';

    let translations: Record<string, string> | undefined;
    const translationsAttr = el.getAttribute('data-translations');
    if (translationsAttr) {
      try {
        translations = JSON.parse(translationsAttr);
      } catch {
        console.warn('[Bugdump] Auto-init: invalid data-translations JSON, ignoring.');
      }
    }

    const consoleFilter = parseFilterAttribute(el.getAttribute('data-console-filter'), 'data-console-filter', [
      'levels',
      'exclude',
    ]);
    const networkFilter = parseFilterAttribute(el.getAttribute('data-network-filter'), 'data-network-filter', [
      'excludeUrls',
      'includeUrls',
      'excludeMethods',
    ]);

    console.debug('[Bugdump] Auto-init config:', {
      apiKey: apiKey ? `${apiKey.slice(0, 8)}…` : null,
      endpoint: endpoint || '(default)',
      captureNetworkBodies,
      hideButton,
      theme: theme || '(default)',
      features,
    });

    if (apiKey) {
      Bugdump.init({
        apiKey,
        ...(endpoint && { endpoint }),
        ...(captureNetworkBodies && { captureNetworkBodies }),
        ...(hideButton && { hideButton }),
        ...(showReportLink && { showReportLink }),
        ...(theme && { theme }),
        ...(icon && { icon }),
        ...(Object.keys(features).length > 0 && { features }),
        ...(translations && { translations }),
        ...(consoleFilter && { consoleFilter }),
        ...(networkFilter && { networkFilter }),
      });
      console.debug('[Bugdump] Auto-init: initialized successfully');
    } else {
      console.warn('[Bugdump] Auto-init: script tag found but data-api-key is missing or empty');
    }
  } else {
    console.debug('[Bugdump] Auto-init: no script tag with data-api-key found, skipping');
  }
}

function parseFilterAttribute(
  raw: string | null,
  attrName: string,
  arrayFields: string[],
): Record<string, unknown> | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[Bugdump] Auto-init: invalid ${attrName} JSON, ignoring.`);
    return undefined;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`[Bugdump] Auto-init: ${attrName} must be a JSON object, ignoring.`);
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!arrayFields.includes(key)) {
      console.warn(`[Bugdump] Auto-init: ${attrName} has unknown field "${key}", ignoring.`);
      continue;
    }
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
      console.warn(`[Bugdump] Auto-init: ${attrName}.${key} must be an array of strings, ignoring.`);
      continue;
    }
    result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
