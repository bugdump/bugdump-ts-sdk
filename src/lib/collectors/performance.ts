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

  const nav = entries[0] as PerformanceNavigationTiming;
  const paintEntries = performance.getEntriesByType('paint');
  const fp = paintEntries.find((e) => e.name === 'first-paint');
  const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint');

  return {
    domContentLoaded: nav.domContentLoadedEventEnd > 0 ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadComplete: nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null,
    firstPaint: fp ? Math.round(fp.startTime) : null,
    firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
    ttfb: nav.responseStart > 0 ? Math.round(nav.responseStart) : null,
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
    size: entry.transferSize || 0,
  }));
}
