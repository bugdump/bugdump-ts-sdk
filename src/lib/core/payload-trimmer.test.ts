import { describe, it, expect } from 'vitest';
import { trimPayload } from './payload-trimmer';
import type { ReportPayload } from '../types';

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;

function serializedLength(payload: ReportPayload): number {
  return JSON.stringify(payload).length;
}

function basePayload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    description: 'a bug 🐛 with "quotes" and \\slash and \nnewline',
    pageUrl: 'https://example.com/path?q=1',
    viewport: { width: 1183, height: 1032 },
    consoleLogs: [],
    networkRequests: [],
    ...overrides,
  };
}

function makeConsoleLog(i: number, argStr: string): Record<string, unknown> {
  return { level: 'log', args: ['msg ' + i, argStr], timestamp: 1000 + i };
}

function makeNetworkRequest(i: number, bodySize: number): Record<string, unknown> {
  return {
    url: 'https://api.example.com/endpoint/' + i,
    method: 'POST',
    status: 200,
    requestBody: 'q'.repeat(bodySize),
    responseBody: 'r'.repeat(bodySize),
    startedAt: i,
  };
}

describe('trimPayload', () => {
  it('passes through a payload under the cap unchanged', () => {
    const payload = basePayload({
      consoleLogs: [makeConsoleLog(0, 'small'), makeConsoleLog(1, 'small')],
      networkRequests: [makeNetworkRequest(0, 10)],
    });
    const before = JSON.stringify(payload);

    const { payload: out, info } = trimPayload(payload);

    expect(JSON.stringify(out)).toBe(before);
    expect(info).toEqual({
      trimmed: false,
      argsTruncated: false,
      bodiesDropped: false,
      consoleLogsDropped: 0,
      networkRequestsDropped: 0,
    });
  });

  it('truncates oversized console args first and ends at or below the cap', () => {
    // One enormous console arg (~12MB) pushes the payload over the 10MB cap.
    const payload = basePayload({
      consoleLogs: [makeConsoleLog(0, 'x'.repeat(12 * 1024 * 1024))],
    });
    expect(serializedLength(payload)).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    const { payload: out, info } = trimPayload(payload);

    expect(info.trimmed).toBe(true);
    expect(info.argsTruncated).toBe(true);
    expect(serializedLength(out)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    // The oversized arg was truncated, not the whole entry dropped.
    expect(info.consoleLogsDropped).toBe(0);
    const args = out.consoleLogs![0]!['args'] as unknown[];
    expect(String(args[1])).toContain('…[trimmed]');
  });

  it('drops network bodies when args alone are not enough', () => {
    // Console args are already small; the bulk is in many large network bodies.
    const requests = Array.from({ length: 250 }, (_, i) => makeNetworkRequest(i, 50 * 1024));
    const payload = basePayload({
      consoleLogs: [makeConsoleLog(0, 'small')],
      networkRequests: requests,
    });
    expect(serializedLength(payload)).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    const { payload: out, info } = trimPayload(payload);

    expect(info.trimmed).toBe(true);
    expect(info.bodiesDropped).toBe(true);
    expect(serializedLength(out)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    // Requests themselves are retained (not dropped) — only their bodies are nulled.
    expect(out.networkRequests!.length).toBe(250);
  });

  it('drops oldest console logs when truncation and body-drop are insufficient', () => {
    // Many console entries, each with a moderately large string that survives the
    // 512-char arg truncation cap only marginally — bulk comes from entry count.
    // Fewer entries, each with a larger surviving arg, so the array still crosses the
    // cap by entry-count bulk but builds fast. Args here are 400 chars — under the 512
    // truncation cap, so trimConsoleLogArgs can't shrink them and the trimmer must drop
    // whole entries.
    const logCount = 30_000;
    const newestTimestamp = 1000 + logCount - 1;
    const logs = Array.from({ length: logCount }, (_, i) => makeConsoleLog(i, 'y'.repeat(400)));
    const payload = basePayload({ consoleLogs: logs });
    expect(serializedLength(payload)).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    const { payload: out, info } = trimPayload(payload);

    expect(info.trimmed).toBe(true);
    expect(info.consoleLogsDropped).toBeGreaterThan(0);
    expect(serializedLength(out)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    // Never drops below the floor.
    expect(out.consoleLogs!.length).toBeGreaterThanOrEqual(30);
    // The newest entries are kept (FIFO drop from the front).
    const lastKept = out.consoleLogs![out.consoleLogs!.length - 1]!;
    expect(lastKept['timestamp']).toBe(newestTimestamp);
  });

  it('keeps the result within the cap even when everything must be trimmed', () => {
    // Big console args AND many big network bodies AND many entries — the network
    // bodies alone (300 × 60KB) exceed the cap, so all trim phases must engage.
    const payload = basePayload({
      consoleLogs: Array.from({ length: 5_000 }, (_, i) => makeConsoleLog(i, 'z'.repeat(300))),
      networkRequests: Array.from({ length: 300 }, (_, i) => makeNetworkRequest(i, 30 * 1024)),
    });
    expect(serializedLength(payload)).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    const { payload: out, info } = trimPayload(payload);

    expect(info.trimmed).toBe(true);
    expect(serializedLength(out)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it('handles a payload with undefined console/network arrays', () => {
    const payload: ReportPayload = {
      description: 'd'.repeat(11 * 1024 * 1024),
      consoleLogs: undefined,
      networkRequests: undefined,
    };
    expect(serializedLength(payload)).toBeGreaterThan(MAX_PAYLOAD_BYTES);

    // Nothing trimmable exists, so it cannot get under the cap — but must not throw,
    // and must still report that trimming was attempted.
    const { payload: out, info } = trimPayload(payload);

    expect(info.trimmed).toBe(true);
    expect(out.description.length).toBe(11 * 1024 * 1024);
  });

  describe('with a maxBytes budget', () => {
    const ERROR_EVENT_MAX_BYTES = 200 * 1024;

    function errorEvent() {
      return {
        eventId: '00000000-0000-4000-8000-000000000000',
        error: { type: 'TypeError', message: 'x is not a function', stack: 's'.repeat(10_000) },
        consoleLogs: [makeConsoleLog(0, 'small')],
        networkRequests: Array.from({ length: 50 }, (_, i) => makeNetworkRequest(i, 20 * 1024)),
      };
    }

    it('trims an error event with 50 large network bodies to under 200 KB', () => {
      const payload = errorEvent();
      expect(JSON.stringify(payload).length).toBeGreaterThan(ERROR_EVENT_MAX_BYTES);

      const { payload: out, info } = trimPayload(payload, ERROR_EVENT_MAX_BYTES);

      expect(info.bodiesDropped).toBe(true);
      expect(JSON.stringify(out).length).toBeLessThanOrEqual(ERROR_EVENT_MAX_BYTES);
      expect(out.networkRequests).toHaveLength(50);
      expect(out.error.stack).toHaveLength(10_000);
    });

    it('counts UTF-8 bytes with the utf8 unit, so non-ASCII telemetry stays under the budget', () => {
      const payload = {
        ...errorEvent(),
        networkRequests: Array.from({ length: 50 }, (_, i) => ({
          ...makeNetworkRequest(i, 0),
          requestBody: 'ж'.repeat(1_500),
          responseBody: '日本'.repeat(500),
        })),
      };
      const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
      expect(JSON.stringify(payload).length).toBeLessThan(ERROR_EVENT_MAX_BYTES);
      expect(utf8Bytes(payload)).toBeGreaterThan(ERROR_EVENT_MAX_BYTES);

      const { payload: out, info } = trimPayload(payload, ERROR_EVENT_MAX_BYTES, 'utf8');

      expect(info.bodiesDropped).toBe(true);
      expect(utf8Bytes(out)).toBeLessThanOrEqual(ERROR_EVENT_MAX_BYTES);
      expect(out.networkRequests).toHaveLength(50);
    });

    it('keeps the 10 MB budget when no maxBytes is given', () => {
      const payload = errorEvent();
      const before = JSON.stringify(payload);

      const { payload: out, info } = trimPayload(payload);

      expect(info.trimmed).toBe(false);
      expect(JSON.stringify(out)).toBe(before);
    });
  });
});
