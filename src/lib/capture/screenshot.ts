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
