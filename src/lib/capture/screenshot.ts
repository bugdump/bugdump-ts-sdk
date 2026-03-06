import html2canvas from 'html2canvas-pro';

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
    target = document.documentElement,
    filter,
  } = options;

  const width = window.innerWidth;
  const height = window.innerHeight;

  const canvas = await html2canvas(target, {
    width,
    height,
    useCORS: true,
    allowTaint: false,
    logging: false,
    ignoreElements: (element: Element) => {
      if (filter && element instanceof HTMLElement && !filter(element)) return true;
      return false;
    },
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b: Blob | null) => {
        if (b) resolve(b);
        else reject(new Error('Screenshot capture failed: no blob produced'));
      },
      DEFAULT_MIME_TYPE,
      quality,
    );
  });

  return { blob, width, height };
}
