export interface MetadataSnapshot {
  userAgent: string;
  language: string;
  platform: string;
  viewport: { width: number; height: number };
  screenResolution: { width: number; height: number };
  devicePixelRatio: number;
  url: string;
  referrer: string;
  timestamp: number;
}

export function captureMetadata(): MetadataSnapshot {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    screenResolution: {
      width: screen.width,
      height: screen.height,
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    url: window.location.href,
    referrer: document.referrer,
    timestamp: Date.now(),
  };
}
