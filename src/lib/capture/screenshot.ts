import { toBlob } from 'html-to-image';

const DEFAULT_QUALITY = 0.85;
const DEFAULT_MIME_TYPE = 'image/jpeg';

export interface ScreenshotOptions {
  quality?: number;
  target?: HTMLElement;
  filter?: (node: HTMLElement) => boolean;
}

export interface ScreenshotResult {
  blob: Blob;
  width: number;
  height: number;
}

export async function captureScreenshot(
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  const {
    quality = DEFAULT_QUALITY,
    target = document.body,
    filter,
  } = options;

  const width = target.scrollWidth;
  const height = target.scrollHeight;

  const blob = await toBlob(target, {
    quality,
    type: DEFAULT_MIME_TYPE,
    filter,
    cacheBust: true,
  });

  if (!blob) {
    throw new Error('Screenshot capture failed: no blob produced');
  }

  return { blob, width, height };
}
