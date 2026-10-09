import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BugdumpApiError, HttpClient } from './http-client';
import type { ErrorEventPayload, ReportPayload } from './types';

const ENDPOINT = 'https://api.test';
const S3_URL = 'https://s3.test/bucket';
const CREATED = { id: 'report-1', taskId: 'task-1', taskPublicId: 7 };

type Answer = (init?: RequestInit) => Response | Promise<Response>;

let answers: Answer[];

const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const answer = answers.shift();
  if (!answer) throw new Error(`Unexpected fetch ${input}`);
  return answer(init);
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fails =
  (status: number, error = `HTTP_${status}`): Answer =>
  () =>
    jsonResponse({ error }, status);
const succeeds: Answer = () => jsonResponse(CREATED, 201);
const networkError: Answer = () => Promise.reject(new TypeError('Failed to fetch'));
// Settles only when the client's own timeout aborts it, the way fetch does.
const hangs: Answer = (init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const report: ReportPayload = { clientReportId: '3b9e2c1a-5d4f-4a6b-9c8d-7e6f5a4b3c2d', description: 'x' };
const errorEvent = {
  eventId: '7d1f3a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  occurredAt: 1,
  error: { type: 'Error', message: 'boom', mechanism: 'manual', handled: true },
} as ErrorEventPayload;

function client(): HttpClient {
  return new HttpClient(ENDPOINT, 'bd_test');
}

/** Runs a request through every backoff wait and returns how it settled. */
async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  const settled = Promise.allSettled([promise]).then(([result]) => result!);
  await vi.runAllTimersAsync();
  return settled;
}

beforeEach(() => {
  answers = [];
  fetchMock.mockClear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HttpClient retries', () => {
  it('retries a 503 and resolves with the next answer', async () => {
    answers = [fails(503), succeeds];

    const result = await settle(client().submitReport(report));

    expect(result).toEqual({ status: 'fulfilled', value: CREATED });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 409 REQUEST_IN_PROGRESS while the first request with the id is still running', async () => {
    answers = [fails(409, 'REQUEST_IN_PROGRESS'), succeeds];

    const result = await settle(client().submitReport(report));

    expect(result).toEqual({ status: 'fulfilled', value: CREATED });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a network error and a timeout', async () => {
    answers = [networkError, hangs, succeeds];

    const result = await settle(client().submitReport(report));

    expect(result).toEqual({ status: 'fulfilled', value: CREATED });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [400, 'VALIDATION_FAILED'],
    [403, 'REPORT_QUOTA_EXCEEDED'],
    [409, 'CONFLICT'],
    [429, 'RATE_LIMIT_EXCEEDED'],
  ])('does not retry a %i %s', async (status, code) => {
    answers = [fails(status, code), succeeds];

    const result = await settle(client().submitReport(report));

    expect(result).toMatchObject({ status: 'rejected', reason: { code, statusCode: status } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each<[string, (http: HttpClient) => Promise<unknown>]>([
    ['a report', (http) => http.submitReport(report)],
    ['an error event', (http) => http.submitErrorEvent(errorEvent)],
    ['a presign', (http) => http.requestUpload({ originalName: 'a.png', mimeType: 'image/png', size: 1 })],
  ])('gives up on %s after 3 attempts with the last error', async (_name, send) => {
    answers = [fails(503), fails(502), fails(500, 'REPORT_SUBMISSION_FAILED'), succeeds];

    const result = await settle(send(client()));

    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'REPORT_SUBMISSION_FAILED', statusCode: 500 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends every attempt of an error event with keepalive', async () => {
    answers = [fails(503), () => new Response(null, { status: 202 })];

    await settle(client().submitErrorEvent(errorEvent));

    expect(fetchMock.mock.calls.map(([, init]) => init?.keepalive)).toEqual([true, true]);
  });

  it('fetches the widget config once', async () => {
    answers = [fails(503), succeeds];

    const result = await settle(client().fetchConfig());

    expect(result.status).toBe('rejected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0, 800, 1_600],
    [0.5, 1_000, 2_000],
    [1, 1_200, 2_400],
  ])('waits 1 s and then 2 s, within 20 %%, at a roll of %f', async (roll, firstWait, secondWait) => {
    vi.spyOn(Math, 'random').mockReturnValue(roll);
    answers = [fails(503), fails(503), succeeds];

    const pending = client().submitReport(report);
    await vi.advanceTimersByTimeAsync(firstWait - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(secondWait - 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(pending).resolves.toEqual(CREATED);
  });
});

describe('HttpClient.uploadFileToS3', () => {
  class FakeXhr {
    static instances: FakeXhr[] = [];
    status = 0;
    upload = { addEventListener: () => {} };
    private listeners = new Map<string, () => void>();

    constructor() {
      FakeXhr.instances.push(this);
    }

    open(): void {}
    send(): void {}

    addEventListener(type: string, listener: () => void): void {
      this.listeners.set(type, listener);
    }

    abort(): void {
      this.listeners.get('abort')?.();
    }

    fail(): void {
      this.listeners.get('error')?.();
    }

    respond(status: number): void {
      this.status = status;
      this.listeners.get('load')?.();
    }
  }

  const file = new Blob(['png'], { type: 'image/png' });

  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('retries a failed upload', async () => {
    answers = [networkError, () => new Response(null, { status: 503 }), () => new Response(null, { status: 204 })];

    const result = await settle(client().uploadFileToS3(S3_URL, { key: 'k' }, file));

    expect(result.status).toBe('fulfilled');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry an upload S3 refuses', async () => {
    answers = [() => new Response(null, { status: 403 }), () => new Response(null, { status: 204 })];

    const result = await settle(client().uploadFileToS3(S3_URL, { key: 'k' }, file));

    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'S3_UPLOAD_FAILED', statusCode: 403 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a progress upload after a network error', async () => {
    const upload = client().uploadFileToS3(S3_URL, { key: 'k' }, file, () => {});

    FakeXhr.instances[0]!.fail();
    await vi.runAllTimersAsync();
    FakeXhr.instances[1]!.respond(204);

    await expect(upload).resolves.toBeUndefined();
    expect(FakeXhr.instances).toHaveLength(2);
  });

  // No timers are run, so a backoff wait before giving up would leave the promise pending.
  it('rejects an aborted upload at once, without retrying it', async () => {
    const http = client();
    const upload = http.uploadFileToS3(S3_URL, { key: 'k' }, file, () => {});

    http.abort();

    await expect(upload).rejects.toBeInstanceOf(BugdumpApiError);
    await expect(upload).rejects.toMatchObject({ code: 'UPLOAD_ABORTED' });
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('stops when aborted while waiting to retry', async () => {
    const http = client();
    const upload = http.uploadFileToS3(S3_URL, { key: 'k' }, file, () => {});

    FakeXhr.instances[0]!.fail();
    http.abort();
    const result = await settle(upload);

    expect(result).toMatchObject({ status: 'rejected', reason: { code: 'UPLOAD_ABORTED' } });
    expect(FakeXhr.instances).toHaveLength(1);
  });
});
