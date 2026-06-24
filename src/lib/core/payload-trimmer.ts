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

function trimConsoleLogArgs(payload: ReportPayload): boolean {
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

    if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) break;
  }
  return truncated;
}

function trimNetworkBodies(payload: ReportPayload): boolean {
  const requests = payload.networkRequests;
  if (!requests?.length) return false;

  let dropped = false;
  for (let i = 0; i < requests.length; i++) {
    if (requests[i]!['requestBody'] != null || requests[i]!['responseBody'] != null) {
      dropped = true;
    }
    requests[i]!['requestBody'] = null;
    requests[i]!['responseBody'] = null;

    if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) break;
  }
  return dropped;
}

function dropOldestConsoleLogs(payload: ReportPayload): number {
  const logs = payload.consoleLogs;
  if (!logs || logs.length <= MIN_CONSOLE_LOGS) return 0;

  let dropped = 0;
  while (logs.length > MIN_CONSOLE_LOGS && measurePayload(payload) > MAX_PAYLOAD_BYTES) {
    logs.shift();
    dropped++;
  }
  return dropped;
}

function dropOldestNetworkRequests(payload: ReportPayload): number {
  const requests = payload.networkRequests;
  if (!requests || requests.length <= MIN_NETWORK_REQUESTS) return 0;

  let dropped = 0;
  while (requests.length > MIN_NETWORK_REQUESTS && measurePayload(payload) > MAX_PAYLOAD_BYTES) {
    requests.shift();
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

  info.argsTruncated = trimConsoleLogArgs(payload);
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return { payload, info };

  info.bodiesDropped = trimNetworkBodies(payload);
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return { payload, info };

  info.consoleLogsDropped = dropOldestConsoleLogs(payload);
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return { payload, info };

  info.networkRequestsDropped = dropOldestNetworkRequests(payload);

  return { payload, info };
}
