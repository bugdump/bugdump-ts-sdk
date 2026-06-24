export interface PerformanceSnapshot {
  timing: PerformanceTimingData | null;
  memory: PerformanceMemoryData | null;
  resources: PerformanceResourceData[];
}

export interface PerformanceTimingData {
  domContentLoaded: number | null;
  loadComplete: number | null;
  firstPaint: number | null;
  firstContentfulPaint: number | null;
  ttfb: number | null;
}

export interface PerformanceMemoryData {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface PerformanceResourceData {
  name: string;
  type: string;
  duration: number;
  size: number;
}

export function capturePerformance(): PerformanceSnapshot {
  return {
    timing: captureTiming(),
    memory: captureMemory(),
    resources: captureResources(),
  };
}

function captureTiming(): PerformanceTimingData | null {
  const entries = performance.getEntriesByType('navigation');
  if (entries.length === 0) return null;

  const nav = entries[0] as PerformanceNavigationTiming & { activationStart?: number };
  const paintEntries = performance.getEntriesByType('paint');
  const fp = paintEntries.find((e) => e.name === 'first-paint');
  const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint');

  // All PerformanceNavigationTiming / paint timestamps are relative to the time
  // origin, not to navigation start. For prerendered pages the page is "activated"
  // partway through the timeline, so user-perceived metrics must be measured from
  // activationStart. For a normal navigation activationStart is 0 and this is a no-op.
  const activationStart = nav.activationStart ?? 0;
  const relativeTo = (timestamp: number): number | null => {
    if (timestamp <= 0) return null;
    return Math.max(0, Math.round(timestamp - activationStart));
  };

  return {
    domContentLoaded: relativeTo(nav.domContentLoadedEventEnd),
    loadComplete: relativeTo(nav.loadEventEnd),
    firstPaint: fp ? relativeTo(fp.startTime) : null,
    firstContentfulPaint: fcp ? relativeTo(fcp.startTime) : null,
    // TTFB is the gap between navigation start and the first response byte.
    // responseStart is relative to the time origin, so subtract the navigation's
    // own startTime (and activationStart for prerender) rather than using it raw.
    ttfb: nav.responseStart > 0 ? Math.max(0, Math.round(nav.responseStart - nav.startTime - activationStart)) : null,
  };
}

function captureMemory(): PerformanceMemoryData | null {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  };

  if (!perf.memory) return null;

  return {
    usedJSHeapSize: perf.memory.usedJSHeapSize,
    totalJSHeapSize: perf.memory.totalJSHeapSize,
    jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
  };
}

function captureResources(): PerformanceResourceData[] {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

  return entries.slice(-20).map((entry) => ({
    name: entry.name,
    type: entry.initiatorType,
    duration: Math.round(entry.duration),
    // transferSize is the bytes over the wire (0 for cached or cross-origin
    // resources without Timing-Allow-Origin). Fall back to the body sizes so the
    // value still reflects the resource weight instead of silently reading 0.
    size: entry.transferSize || entry.encodedBodySize || entry.decodedBodySize || 0,
  }));
}
