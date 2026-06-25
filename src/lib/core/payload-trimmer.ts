import type { ReportPayload } from '../types';

// 10 MB cap. Server bodyLimit is 25 MB, so the large margin absorbs the difference
// between this character count (UTF-16 units via .length) and the UTF-8 byte length
// the server actually measures.
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
const TRIMMED_ARG_LENGTH = 512;
const MIN_CONSOLE_LOGS = 30;
const MIN_NETWORK_REQUESTS = 20;

export interface TrimInfo {
  trimmed: boolean;
  argsTruncated: boolean;
  bodiesDropped: boolean;
  consoleLogsDropped: number;
  networkRequestsDropped: number;
}

function measurePayload(payload: ReportPayload): number {
  return JSON.stringify(payload).length;
}

/**
 * Tracks `JSON.stringify(payload).length` while the two heavy arrays (consoleLogs,
 * networkRequests) are trimmed, without re-serializing the whole payload on every
 * step. The size is split into a constant base (the payload with both arrays empty)
 * plus the exact serialized length of each array, recomputed incrementally as
 * elements are mutated, dropped, or truncated. The arithmetic mirrors how JSON
 * serializes an array — `[` + elements joined by `,` + `]` — so the running total is
 * identical to a full `JSON.stringify(payload).length` at every step.
 */
class PayloadSizer {
  private base: number;
  private consoleLen: number[];
  private networkLen: number[];

  constructor(private payload: ReportPayload) {
    const logs = payload.consoleLogs ?? [];
    const requests = payload.networkRequests ?? [];

    this.consoleLen = logs.map((entry) => JSON.stringify(entry).length);
    this.networkLen = requests.map((entry) => JSON.stringify(entry).length);

    // Base = full payload with both heavy arrays emptied to `[]` (length 2 each).
    const savedLogs = payload.consoleLogs;
    const savedRequests = payload.networkRequests;
    if (savedLogs) payload.consoleLogs = [];
    if (savedRequests) payload.networkRequests = [];
    this.base = JSON.stringify(payload).length;
    if (savedLogs) payload.consoleLogs = savedLogs;
    if (savedRequests) payload.networkRequests = savedRequests;
  }

  /** Serialized length of an array given each element's serialized length. */
  private arrayLength(elementLengths: number[]): number {
    if (elementLengths.length === 0) return 2; // "[]"
    let sum = 2 + elementLengths.length - 1; // brackets + (n-1) commas
    for (const len of elementLengths) sum += len;
    return sum;
  }

  total(): number {
    // Subtract the two empty "[]" baked into base, add the real array lengths.
    return (
      this.base -
      (this.payload.consoleLogs ? 2 : 0) -
      (this.payload.networkRequests ? 2 : 0) +
      (this.payload.consoleLogs ? this.arrayLength(this.consoleLen) : 0) +
      (this.payload.networkRequests ? this.arrayLength(this.networkLen) : 0)
    );
  }

  setConsoleEntry(index: number): void {
    this.consoleLen[index] = JSON.stringify(this.payload.consoleLogs![index]).length;
  }

  setNetworkEntry(index: number): void {
    this.networkLen[index] = JSON.stringify(this.payload.networkRequests![index]).length;
  }

  shiftConsole(): void {
    this.consoleLen.shift();
  }

  shiftNetwork(): void {
    this.networkLen.shift();
  }
}

function trimConsoleLogArgs(payload: ReportPayload, sizer: PayloadSizer): boolean {
  const logs = payload.consoleLogs;
  if (!logs?.length) return false;

  let truncated = false;
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i]!;
    const args = entry['args'];
    if (!Array.isArray(args)) continue;

    entry['args'] = args.map((arg) => {
      if (arg === null || arg === undefined) return arg;
      if (typeof arg === 'string') {
        if (arg.length > TRIMMED_ARG_LENGTH) {
          truncated = true;
          return arg.slice(0, TRIMMED_ARG_LENGTH) + '…[trimmed]';
        }
        return arg;
      }
      if (typeof arg === 'number' || typeof arg === 'boolean') return arg;

      const str = JSON.stringify(arg);
      if (str.length > TRIMMED_ARG_LENGTH) {
        truncated = true;
        return str.slice(0, TRIMMED_ARG_LENGTH) + '…[trimmed]';
      }
      return arg;
    });

    sizer.setConsoleEntry(i);
    if (sizer.total() <= MAX_PAYLOAD_BYTES) break;
  }
  return truncated;
}

function trimNetworkBodies(payload: ReportPayload, sizer: PayloadSizer): boolean {
  const requests = payload.networkRequests;
  if (!requests?.length) return false;

  let dropped = false;
  for (let i = 0; i < requests.length; i++) {
    if (requests[i]!['requestBody'] != null || requests[i]!['responseBody'] != null) {
      dropped = true;
    }
    requests[i]!['requestBody'] = null;
    requests[i]!['responseBody'] = null;

    sizer.setNetworkEntry(i);
    if (sizer.total() <= MAX_PAYLOAD_BYTES) break;
  }
  return dropped;
}

function dropOldestConsoleLogs(payload: ReportPayload, sizer: PayloadSizer): number {
  const logs = payload.consoleLogs;
  if (!logs || logs.length <= MIN_CONSOLE_LOGS) return 0;

  let dropped = 0;
  while (logs.length > MIN_CONSOLE_LOGS && sizer.total() > MAX_PAYLOAD_BYTES) {
    logs.shift();
    sizer.shiftConsole();
    dropped++;
  }
  return dropped;
}

function dropOldestNetworkRequests(payload: ReportPayload, sizer: PayloadSizer): number {
  const requests = payload.networkRequests;
  if (!requests || requests.length <= MIN_NETWORK_REQUESTS) return 0;

  let dropped = 0;
  while (requests.length > MIN_NETWORK_REQUESTS && sizer.total() > MAX_PAYLOAD_BYTES) {
    requests.shift();
    sizer.shiftNetwork();
    dropped++;
  }
  return dropped;
}

function emptyTrimInfo(): TrimInfo {
  return {
    trimmed: false,
    argsTruncated: false,
    bodiesDropped: false,
    consoleLogsDropped: 0,
    networkRequestsDropped: 0,
  };
}

export function trimPayload(payload: ReportPayload): { payload: ReportPayload; info: TrimInfo } {
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return { payload, info: emptyTrimInfo() };

  const info: TrimInfo = { ...emptyTrimInfo(), trimmed: true };
  const sizer = new PayloadSizer(payload);

  info.argsTruncated = trimConsoleLogArgs(payload, sizer);
  if (sizer.total() <= MAX_PAYLOAD_BYTES) return { payload, info };

  info.bodiesDropped = trimNetworkBodies(payload, sizer);
  if (sizer.total() <= MAX_PAYLOAD_BYTES) return { payload, info };

  info.consoleLogsDropped = dropOldestConsoleLogs(payload, sizer);
  if (sizer.total() <= MAX_PAYLOAD_BYTES) return { payload, info };

  info.networkRequestsDropped = dropOldestNetworkRequests(payload, sizer);

  return { payload, info };
}
