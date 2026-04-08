import html2canvas from 'html2canvas-pro';

const DEFAULT_QUALITY = 1;
const DEFAULT_MIME_TYPE = 'image/jpeg';
const PAGE_READY_TIMEOUT = 5000;

async function waitForPageReady(): Promise<void> {
  if (document.readyState !== 'complete') {
    await Promise.race([
      new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true })),
      new Promise<void>((r) => setTimeout(r, PAGE_READY_TIMEOUT)),
    ]);
  }

  const images = Array.from(document.querySelectorAll('img'))
    .filter((img) => img.src && img.offsetParent !== null);
  const pendingImages = images.filter((img) => !img.complete);

  if (pendingImages.length > 0) {
    await Promise.race([
      Promise.all(
        pendingImages.map(
          (img) =>
            new Promise<void>((r) => {
              img.addEventListener('load', () => r(), { once: true });
              img.addEventListener('error', () => r(), { once: true });
            }),
        ),
      ),
      new Promise<void>((r) => setTimeout(r, PAGE_READY_TIMEOUT)),
    ]);
  }
}

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

  await waitForPageReady();

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

export async function captureScreenshotNative(
  options: Pick<ScreenshotOptions, 'quality'> = {},
): Promise<ScreenshotResult> {
  const { quality = DEFAULT_QUALITY } = options;

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
    preferCurrentTab: true,
  } as DisplayMediaStreamOptions);

  try {
    const track = stream.getVideoTracks()[0]!;
    const settings = track.getSettings();
    const width = settings.width || window.innerWidth;
    const height = settings.height || window.innerHeight;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, width, height);

    video.pause();
    video.srcObject = null;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b: Blob | null) => {
          if (b) resolve(b);
          else reject(new Error('Native screenshot capture failed: no blob produced'));
        },
        DEFAULT_MIME_TYPE,
        quality,
      );
    });

    return { blob, width, height };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
