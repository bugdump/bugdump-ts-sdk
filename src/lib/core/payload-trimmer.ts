import type { ReportPayload } from '../types';

const MAX_PAYLOAD_BYTES = 9 * 1024 * 1024; // 9 MB — server limit is 10 MB, keep 1 MB headroom
const TRIMMED_ARG_LENGTH = 512;
const MIN_CONSOLE_LOGS = 10;
const MIN_NETWORK_REQUESTS = 5;

function measurePayload(payload: ReportPayload): number {
  return JSON.stringify(payload).length;
}

function trimConsoleLogArgs(payload: ReportPayload): void {
  const logs = payload.consoleLogs;
  if (!logs?.length) return;

  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i]!;
    const args = entry['args'];
    if (!Array.isArray(args)) continue;

    entry['args'] = args.map((arg) => {
      if (arg === null || arg === undefined) return arg;
      if (typeof arg === 'string') {
        return arg.length > TRIMMED_ARG_LENGTH ? arg.slice(0, TRIMMED_ARG_LENGTH) + '…[trimmed]' : arg;
      }
      if (typeof arg === 'number' || typeof arg === 'boolean') return arg;

      const str = JSON.stringify(arg);
      return str.length > TRIMMED_ARG_LENGTH ? str.slice(0, TRIMMED_ARG_LENGTH) + '…[trimmed]' : arg;
    });

    if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return;
  }
}

function trimNetworkBodies(payload: ReportPayload): void {
  const requests = payload.networkRequests;
  if (!requests?.length) return;

  for (let i = 0; i < requests.length; i++) {
    requests[i]!['requestBody'] = null;
    requests[i]!['responseBody'] = null;

    if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return;
  }
}

function dropOldestConsoleLogs(payload: ReportPayload): void {
  const logs = payload.consoleLogs;
  if (!logs || logs.length <= MIN_CONSOLE_LOGS) return;

  while (logs.length > MIN_CONSOLE_LOGS && measurePayload(payload) > MAX_PAYLOAD_BYTES) {
    logs.shift();
  }
}

function dropOldestNetworkRequests(payload: ReportPayload): void {
  const requests = payload.networkRequests;
  if (!requests || requests.length <= MIN_NETWORK_REQUESTS) return;

  while (requests.length > MIN_NETWORK_REQUESTS && measurePayload(payload) > MAX_PAYLOAD_BYTES) {
    requests.shift();
  }
}

export function trimPayload(payload: ReportPayload): ReportPayload {
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return payload;

  trimConsoleLogArgs(payload);
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return payload;

  trimNetworkBodies(payload);
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return payload;

  dropOldestConsoleLogs(payload);
  if (measurePayload(payload) <= MAX_PAYLOAD_BYTES) return payload;

  dropOldestNetworkRequests(payload);

  return payload;
}
