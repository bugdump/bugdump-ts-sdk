// 10 MB cap. Server bodyLimit is 25 MB, so the large margin absorbs the difference
// between this character count (UTF-16 units via .length) and the UTF-8 byte length
// the server actually measures.
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
const TRIMMED_ARG_LENGTH = 512;
const MIN_CONSOLE_LOGS = 30;
const MIN_NETWORK_REQUESTS = 20;

/** The fields the trimmer cuts; the rest of the payload is only measured. */
export interface TrimmablePayload {
  consoleLogs?: Record<string, unknown>[];
  networkRequests?: Record<string, unknown>[];
}

/**
 * How the budget is measured: `utf16` is `JSON.stringify(payload).length`, `utf8` the encoded
 * byte length, which is what a server body limit counts.
 */
export type PayloadSizeUnit = 'utf16' | 'utf8';

type Measure = (json: string) => number;

const utf8Encoder = new TextEncoder();
const MEASURES: Record<PayloadSizeUnit, Measure> = {
  utf16: (json) => json.length,
  utf8: (json) => utf8Encoder.encode(json).length,
};

export interface TrimInfo {
  trimmed: boolean;
  argsTruncated: boolean;
  bodiesDropped: boolean;
  consoleLogsDropped: number;
  networkRequestsDropped: number;
}

/**
 * Tracks the measured size of `JSON.stringify(payload)` while the two heavy arrays (consoleLogs,
 * networkRequests) are trimmed, without re-serializing the whole payload on every
 * step. The size is split into a constant base (the payload with both arrays empty)
 * plus the exact serialized length of each array, recomputed incrementally as
 * elements are mutated, dropped, or truncated. The arithmetic mirrors how JSON
 * serializes an array — `[` + elements joined by `,` + `]`, each 1 in either unit — so the
 * running total equals a full measure of `JSON.stringify(payload)` at every step.
 *
 * Every operation here is O(1): the element lengths are kept as running sums, and a
 * dropped prefix is tracked with a start index rather than shifted out. Both matter —
 * this runs in the page at report time, and the arrays it trims are exactly the ones
 * that grow to tens of thousands of entries.
 */
class PayloadSizer {
  private base: number;
  private consoleLen: number[];
  private networkLen: number[];
  private consoleSum = 0;
  private networkSum = 0;
  private consoleStart = 0;
  private networkStart = 0;

  constructor(
    private payload: TrimmablePayload,
    private measure: Measure,
  ) {
    const logs = payload.consoleLogs ?? [];
    const requests = payload.networkRequests ?? [];

    this.consoleLen = logs.map((entry) => measure(JSON.stringify(entry)));
    this.networkLen = requests.map((entry) => measure(JSON.stringify(entry)));
    for (const len of this.consoleLen) this.consoleSum += len;
    for (const len of this.networkLen) this.networkSum += len;

    // Base = full payload with both heavy arrays emptied to `[]` (length 2 each).
    const savedLogs = payload.consoleLogs;
    const savedRequests = payload.networkRequests;
    if (savedLogs) payload.consoleLogs = [];
    if (savedRequests) payload.networkRequests = [];
    this.base = measure(JSON.stringify(payload));
    if (savedLogs) payload.consoleLogs = savedLogs;
    if (savedRequests) payload.networkRequests = savedRequests;
  }

  /** Serialized length of an array of `count` elements whose lengths sum to `sum`. */
  private arrayLength(count: number, sum: number): number {
    if (count === 0) return 2; // "[]"
    return 2 + count - 1 + sum; // brackets + (n-1) commas + elements
  }

  total(): number {
    // Subtract the two empty "[]" baked into base, add the real array lengths.
    return (
      this.base -
      (this.payload.consoleLogs ? 2 : 0) -
      (this.payload.networkRequests ? 2 : 0) +
      (this.payload.consoleLogs ? this.arrayLength(this.consoleLen.length - this.consoleStart, this.consoleSum) : 0) +
      (this.payload.networkRequests ? this.arrayLength(this.networkLen.length - this.networkStart, this.networkSum) : 0)
    );
  }

  setConsoleEntry(index: number): void {
    const at = this.consoleStart + index;
    const next = this.measure(JSON.stringify(this.payload.consoleLogs![index]));
    this.consoleSum += next - this.consoleLen[at]!;
    this.consoleLen[at] = next;
  }

  setNetworkEntry(index: number): void {
    const at = this.networkStart + index;
    const next = this.measure(JSON.stringify(this.payload.networkRequests![index]));
    this.networkSum += next - this.networkLen[at]!;
    this.networkLen[at] = next;
  }

  shiftConsole(): void {
    this.consoleSum -= this.consoleLen[this.consoleStart]!;
    this.consoleStart++;
  }

  shiftNetwork(): void {
    this.networkSum -= this.networkLen[this.networkStart]!;
    this.networkStart++;
  }
}

function trimConsoleLogArgs(payload: TrimmablePayload, sizer: PayloadSizer, maxBytes: number): boolean {
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
    if (sizer.total() <= maxBytes) break;
  }
  return truncated;
}

function trimNetworkBodies(payload: TrimmablePayload, sizer: PayloadSizer, maxBytes: number): boolean {
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
    if (sizer.total() <= maxBytes) break;
  }
  return dropped;
}

function dropOldestConsoleLogs(payload: TrimmablePayload, sizer: PayloadSizer, maxBytes: number): number {
  const logs = payload.consoleLogs;
  if (!logs || logs.length <= MIN_CONSOLE_LOGS) return 0;

  // Counted first and spliced once: dropping one at a time would shift the whole array
  // on every step, which is the same quadratic cost the sizer exists to avoid.
  let dropped = 0;
  while (logs.length - dropped > MIN_CONSOLE_LOGS && sizer.total() > maxBytes) {
    sizer.shiftConsole();
    dropped++;
  }
  if (dropped > 0) logs.splice(0, dropped);
  return dropped;
}

function dropOldestNetworkRequests(payload: TrimmablePayload, sizer: PayloadSizer, maxBytes: number): number {
  const requests = payload.networkRequests;
  if (!requests || requests.length <= MIN_NETWORK_REQUESTS) return 0;

  let dropped = 0;
  while (requests.length - dropped > MIN_NETWORK_REQUESTS && sizer.total() > maxBytes) {
    sizer.shiftNetwork();
    dropped++;
  }
  if (dropped > 0) requests.splice(0, dropped);
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

export function trimPayload<T extends TrimmablePayload>(
  payload: T,
  maxBytes = MAX_PAYLOAD_BYTES,
  unit: PayloadSizeUnit = 'utf16',
): { payload: T; info: TrimInfo } {
  const measure = MEASURES[unit];
  if (measure(JSON.stringify(payload)) <= maxBytes) return { payload, info: emptyTrimInfo() };

  const info: TrimInfo = { ...emptyTrimInfo(), trimmed: true };
  const sizer = new PayloadSizer(payload, measure);

  info.argsTruncated = trimConsoleLogArgs(payload, sizer, maxBytes);
  if (sizer.total() <= maxBytes) return { payload, info };

  info.bodiesDropped = trimNetworkBodies(payload, sizer, maxBytes);
  if (sizer.total() <= maxBytes) return { payload, info };

  info.consoleLogsDropped = dropOldestConsoleLogs(payload, sizer, maxBytes);
  if (sizer.total() <= maxBytes) return { payload, info };

  info.networkRequestsDropped = dropOldestNetworkRequests(payload, sizer, maxBytes);

  return { payload, info };
}
