import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bugdump } from './client';
import { BugdumpApiError } from './http-client';
import { ActionCollector } from './collectors/action';
import { NetworkCollector, type NetworkRequestEntry } from './collectors/network';
import type { ReportResponse, UserAction } from './types';
import type { Attachment, PanelSubmitData } from './ui/panel-types';

const ENDPOINT = 'https://api.test';
const S3_URL = 'https://s3.test/bucket';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface Call {
  url: string;
  body: unknown;
  keepalive?: boolean;
}

let calls: Call[];
let reportStatus: number;
let reportError: string;
let errorResponse: () => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
  calls.push({ url: input, body, keepalive: init?.keepalive });

  if (input === `${ENDPOINT}/api/widget/v1/config`) {
    return jsonResponse({
      maxMediaSizePerReport: 25 * 1024 * 1024,
      features: { sessionReplay: false, screenRecording: true, removeBranding: false },
      portalUrl: null,
      dashboardUrl: 'https://app.test/projects/demo/tasks',
    });
  }
  if (input === `${ENDPOINT}/api/widget/v1/reports/upload`) {
    return jsonResponse({ fileId: `file-${calls.length}`, url: S3_URL, fields: { key: 'k' } });
  }
  if (input === S3_URL) {
    return new Response(null, { status: 204 });
  }
  if (input === `${ENDPOINT}/api/widget/v1/reports`) {
    return reportStatus === 201
      ? jsonResponse({ id: 'report-1', taskId: 'task-1', taskPublicId: 7 }, 201)
      : jsonResponse({ error: reportError }, reportStatus);
  }
  if (input === `${ENDPOINT}/api/widget/v1/errors`) {
    return errorResponse();
  }
  throw new Error(`Unexpected fetch ${input}`);
});

// init() runs before the browser globals exist, so it mounts no widget and patches nothing;
// submit() then reads page metadata from these stand-ins.
function stubBrowser(): void {
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 2,
    location: { href: 'https://shop.test/checkout' },
  });
  vi.stubGlobal('document', { referrer: '' });
  vi.stubGlobal('screen', { width: 1920, height: 1080 });
}

// The widget's uploads report progress, so they go through XMLHttpRequest rather than fetch.
class FakeXhr {
  status = 0;
  upload = { addEventListener: () => {} };
  private url = '';
  private listeners = new Map<string, () => void>();

  open(_method: string, url: string): void {
    this.url = url;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  send(): void {
    calls.push({ url: this.url, body: undefined });
    this.status = 204;
    queueMicrotask(() => this.listeners.get('load')?.());
  }

  abort(): void {}
}

function reportBodies(): Record<string, unknown>[] {
  return calls
    .filter((c) => c.url === `${ENDPOINT}/api/widget/v1/reports`)
    .map((c) => c.body as Record<string, unknown>);
}

function reportBody(): Record<string, unknown> {
  const report = calls.find((c) => c.url === `${ENDPOINT}/api/widget/v1/reports`);
  return report?.body as Record<string, unknown>;
}

function errorBodies(): Record<string, unknown>[] {
  return calls
    .filter((c) => c.url === `${ENDPOINT}/api/widget/v1/errors`)
    .map((c) => c.body as Record<string, unknown>);
}

function errorCalls(): Call[] {
  return calls.filter((c) => c.url === `${ENDPOINT}/api/widget/v1/errors`);
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  calls = [];
  reportStatus = 201;
  reportError = 'VALIDATION_FAILED';
  errorResponse = async () => new Response(null, { status: 202 });
  vi.stubGlobal('fetch', fetchMock);
  const session = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
  });
});

afterEach(() => {
  vi.useRealTimers();
  Bugdump.getInstance()?.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete globalThis._bugdumpDebugIds;
});

describe('Bugdump.submit', () => {
  it('sends the form fields with the identified user, context and page', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    bugdump.identify({ id: 'user-1', name: 'Ada', email: 'ada@example.com' });
    bugdump.setContext({ plan: 'pro' });
    stubBrowser();

    const result = await bugdump.submit({ description: 'Checkout is broken', priority: 'High', taskId: 42 });

    expect(result).toEqual({ id: 'report-1', taskId: 'task-1', taskPublicId: 7 });
    expect(reportBody()).toMatchObject({
      description: 'Checkout is broken',
      priority: 'High',
      taskPublicId: 42,
      reporterName: 'Ada',
      reporterEmail: 'ada@example.com',
      reporterExternalId: 'user-1',
      customContext: { plan: 'pro' },
      pageUrl: 'https://shop.test/checkout',
      viewport: { width: 1280, height: 800 },
    });
  });

  it('prefers the reporter the form collected over the identified user', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    bugdump.identify({ name: 'Ada', email: 'ada@example.com' });
    stubBrowser();

    await bugdump.submit({ description: 'x', reporterName: 'Grace', reporterEmail: 'grace@example.com' });

    expect(reportBody()).toMatchObject({ reporterName: 'Grace', reporterEmail: 'grace@example.com' });
  });

  it('uploads files first and attaches them to the report', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();

    await bugdump.submit({
      description: 'See the log',
      files: [new File(['log line'], 'app.log', { type: '' }), new Blob(['png'], { type: 'image/png' })],
    });

    const uploads = calls.filter((c) => c.url === `${ENDPOINT}/api/widget/v1/reports/upload`);
    expect(uploads.map((c) => c.body)).toEqual([
      { originalName: 'app.log', mimeType: 'application/octet-stream', size: 8 },
      { originalName: 'attachment', mimeType: 'image/png', size: 3 },
    ]);
    expect(calls.filter((c) => c.url === S3_URL)).toHaveLength(2);
    expect(reportBody().attachments).toEqual([
      { fileId: expect.any(String), type: 'file' },
      { fileId: expect.any(String), type: 'file' },
    ]);
  });

  it('rejects with the API error when the report is refused', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();
    reportStatus = 400;

    await expect(bugdump.submit({ description: 'x' })).rejects.toBeInstanceOf(BugdumpApiError);
  });

  it('rejects with the quota code when the project is not accepting reports', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();
    reportStatus = 403;
    reportError = 'REPORT_QUOTA_EXCEEDED';

    const submission = bugdump.submit({ description: 'x' });

    await expect(submission).rejects.toBeInstanceOf(BugdumpApiError);
    await expect(submission).rejects.toMatchObject({ code: 'REPORT_QUOTA_EXCEEDED', statusCode: 403 });
  });

  it('refuses to run outside a browser', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });

    await expect(bugdump.submit({ description: 'x' })).rejects.toThrow('only run in a browser');
    expect(reportBody()).toBeUndefined();
  });

  it('gives each call its own clientReportId', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();

    await bugdump.submit({ description: 'first' });
    await bugdump.submit({ description: 'second' });

    const [first, second] = reportBodies().map((body) => body.clientReportId);
    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });
});

describe('Bugdump panel reports', () => {
  const CLIENT_REPORT_ID = '3b9e2c1a-5d4f-4a6b-9c8d-7e6f5a4b3c2d';

  // No widget is mounted without a DOM; this is the handler the panel calls when Send is pressed.
  function sendFromPanel(bugdump: Bugdump, data: PanelSubmitData): Promise<ReportResponse> {
    return (bugdump as unknown as { handleSubmit(data: PanelSubmitData): Promise<ReportResponse> }).handleSubmit(data);
  }

  function panelData(attachments: Attachment[]): PanelSubmitData {
    return {
      clientReportId: CLIENT_REPORT_ID,
      description: 'Checkout is broken',
      reporterName: '',
      reporterEmail: '',
      taskPublicId: null,
      attachments,
      actions: [],
    };
  }

  it('resends the same clientReportId without presigning or uploading an attachment again', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const screenshot = {
      id: 'att_1',
      type: 'screenshot',
      blob: new Blob(['png'], { type: 'image/png' }),
      name: 's.png',
    };
    const data = panelData([screenshot] as Attachment[]);
    reportStatus = 500;
    reportError = 'REPORT_SUBMISSION_FAILED';

    const failed = sendFromPanel(bugdump, data);
    const failure = expect(failed).rejects.toMatchObject({ statusCode: 500 });
    await vi.runAllTimersAsync();
    await failure;
    reportStatus = 201;
    await expect(sendFromPanel(bugdump, data)).resolves.toEqual({ id: 'report-1', taskId: 'task-1', taskPublicId: 7 });

    const reports = reportBodies();
    expect(reports).toHaveLength(4);
    expect(reports.map((body) => body.clientReportId)).toEqual(Array(4).fill(CLIENT_REPORT_ID));
    expect(reports[3]!.attachments).toEqual(reports[0]!.attachments);
    expect(calls.filter((c) => c.url === `${ENDPOINT}/api/widget/v1/reports/upload`)).toHaveLength(1);
    expect(calls.filter((c) => c.url === S3_URL)).toHaveLength(1);
  });

  it('uploads an annotated screenshot again on a resend, since annotating replaces its blob', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const screenshot = {
      id: 'att_1',
      type: 'screenshot',
      blob: new Blob(['png'], { type: 'image/png' }),
      name: 's.png',
    } as Attachment;
    reportStatus = 500;
    reportError = 'REPORT_SUBMISSION_FAILED';

    const failed = sendFromPanel(bugdump, panelData([screenshot]));
    const failure = expect(failed).rejects.toMatchObject({ statusCode: 500 });
    await vi.runAllTimersAsync();
    await failure;
    reportStatus = 201;
    const annotated = { ...screenshot, blob: new Blob(['annotated png'], { type: 'image/png' }) };
    await sendFromPanel(bugdump, panelData([annotated]));

    const reports = reportBodies();
    expect(calls.filter((c) => c.url === `${ENDPOINT}/api/widget/v1/reports/upload`)).toHaveLength(2);
    expect(calls.filter((c) => c.url === S3_URL)).toHaveLength(2);
    expect(reports.at(-1)!.attachments).not.toEqual(reports[0]!.attachments);
  });
});

describe('Bugdump error events', () => {
  const APP_FILE = 'https://shop.test/assets/index-BxT3kQ9a.js';

  function appError(message = 'x is not a function'): Error {
    const error = new Error(message);
    error.name = 'TypeError';
    error.stack = `TypeError: ${message}\n    at onClick (${APP_FILE}:10:5)`;
    return error;
  }

  it('sends a handled manual event with the reporter, page, context, telemetry and debug IDs', async () => {
    globalThis._bugdumpDebugIds = { [`Error\n    at ${APP_FILE}:1:95`]: '00000000-0000-4000-8000-000000000001' };
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT, release: 'abc123' });
    bugdump.identify({ id: 'user-1', name: 'Ada', email: 'ada@example.com' });
    bugdump.setContext({ plan: 'pro' });
    stubBrowser();
    const error = appError();

    bugdump.captureException(error, { context: { componentStack: 'at Cart' } });
    await flushPromises();

    const [body] = errorBodies();
    expect(body).toMatchObject({
      eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      occurredAt: expect.any(Number),
      release: 'abc123',
      debugIds: { [APP_FILE]: '00000000-0000-4000-8000-000000000001' },
      error: {
        type: 'TypeError',
        message: 'x is not a function',
        stack: error.stack,
        mechanism: 'manual',
        handled: true,
      },
      reporterName: 'Ada',
      reporterEmail: 'ada@example.com',
      reporterExternalId: 'user-1',
      pageUrl: 'https://shop.test/checkout',
      viewport: { width: 1280, height: 800 },
      consoleLogs: [],
      networkRequests: [],
      performance: expect.any(Object),
      customContext: { plan: 'pro', componentStack: 'at Cart' },
    });
    expect(bugdump.getContext()).toEqual({ plan: 'pro' });
  });

  it('only sends the fields the error endpoint accepts', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();

    bugdump.captureException(appError());
    await flushPromises();

    const allowed = [
      'eventId',
      'occurredAt',
      'release',
      'debugIds',
      'error',
      'reporterName',
      'reporterEmail',
      'reporterExternalId',
      'pageUrl',
      'referrerUrl',
      'userAgent',
      'viewport',
      'consoleLogs',
      'networkRequests',
      'actions',
      'performance',
      'customContext',
      'telemetryTrimmed',
    ];
    expect(Object.keys(errorBodies()[0]!).filter((key) => !allowed.includes(key))).toEqual([]);
  });

  it('sends nothing when beforeSend returns null', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT, beforeSend: () => null });
    stubBrowser();

    bugdump.captureException(appError());
    await flushPromises();

    expect(errorBodies()).toEqual([]);
  });

  it('sends what beforeSend returns', async () => {
    const bugdump = Bugdump.init({
      apiKey: 'bd_test',
      endpoint: ENDPOINT,
      beforeSend: (event) => ({ ...event, error: { ...event.error, message: 'scrubbed' } }),
    });
    stubBrowser();

    bugdump.captureException(appError());
    await flushPromises();

    expect(errorBodies()[0]).toMatchObject({ error: { message: 'scrubbed' } });
  });

  it('sends the event unchanged, with a warning, when beforeSend throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bugdump = Bugdump.init({
      apiKey: 'bd_test',
      endpoint: ENDPOINT,
      beforeSend: (event) => {
        event.error.message = 'half-changed';
        throw new Error('hook bug');
      },
    });
    stubBrowser();

    bugdump.captureException(appError());
    await flushPromises();

    expect(errorBodies()[0]).toMatchObject({ error: { message: 'x is not a function' } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Bugdump] beforeSend threw'), expect.any(Error));
  });

  it('builds a v4 event ID from getRandomValues when randomUUID is missing', async () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff) });
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();

    bugdump.captureException(appError());
    await flushPromises();

    expect(errorBodies()[0]!.eventId).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('sends captureException even with sampleRate 0 and captureErrors off', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT, sampleRate: 0, captureErrors: false });
    stubBrowser();

    bugdump.captureException(appError());
    await flushPromises();

    expect(errorBodies()).toHaveLength(1);
  });

  it('caps captureException at 10 events a minute', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();

    for (let i = 0; i < 12; i++) bugdump.captureException(appError(`error ${i}`));
    await flushPromises();

    expect(errorBodies()).toHaveLength(10);
  });

  it('only warns when called on an instance that is not initialized', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    bugdump.destroy();

    expect(() => bugdump.captureException(appError())).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Bugdump] captureException ignored'));
    expect(errorBodies()).toEqual([]);
  });

  it('never turns a failed send into a new error', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    errorResponse = async () => {
      throw new TypeError('Failed to fetch');
    };
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    bugdump.captureException(appError());
    await vi.runAllTimersAsync();
    process.off('unhandledRejection', unhandled);

    expect(errorBodies()).toHaveLength(3);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it.each(['ERROR_CAPTURE_DISABLED', 'ERROR_QUOTA_EXCEEDED'])(
    'stops capturing for the page after a 403 %s',
    async (code) => {
      errorResponse = async () => jsonResponse({ error: code }, 403);
      const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
      stubBrowser();

      bugdump.captureException(appError('first'));
      await flushPromises();
      bugdump.captureException(appError('second'));
      await flushPromises();

      expect(errorBodies()).toHaveLength(1);
    },
  );

  it('keeps capturing after other failures, once their retries are spent', async () => {
    errorResponse = async () => jsonResponse({ error: 'REQUEST_QUEUE_UNAVAILABLE' }, 500);
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    bugdump.captureException(appError('first'));
    await vi.runAllTimersAsync();
    bugdump.captureException(appError('second'));
    await vi.runAllTimersAsync();

    expect(errorBodies().map((body) => (body.error as { message: string }).message)).toEqual([
      ...Array(3).fill('first'),
      ...Array(3).fill('second'),
    ]);
  });

  it('cuts the message to 2,000 and the stack to 32,000 characters and sends at most 200 actions', async () => {
    const actions: UserAction[] = Array.from({ length: 300 }, (_, i) => ({ kind: 'click', ts: i, selector: `#b${i}` }));
    vi.spyOn(ActionCollector.prototype, 'getRecentActions').mockReturnValue(actions);
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();
    const error = new Error('m'.repeat(5_000));
    error.stack = 's'.repeat(40_000);

    bugdump.captureException(error);
    await flushPromises();

    const body = errorBodies()[0]! as { error: { message: string; stack: string }; actions: UserAction[] };
    expect(body.error.message).toHaveLength(2_000);
    expect(body.error.stack).toHaveLength(32_000);
    expect(body.actions).toHaveLength(200);
    expect(body.actions[199]).toEqual(actions[299]);
  });

  it('trims an event to 200 KB of UTF-8, not of characters', async () => {
    const request = (i: number): NetworkRequestEntry => ({
      method: 'POST',
      url: `https://shop.test/api/${i}`,
      status: 200,
      statusText: 'OK',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: 'ж'.repeat(1_500),
      responseBody: 'ж'.repeat(1_500),
      duration: 10,
      startedAt: i,
      error: null,
    });
    vi.spyOn(NetworkCollector.prototype, 'snapshot').mockReturnValue(Array.from({ length: 50 }, (_, i) => request(i)));
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();

    bugdump.captureException(appError());
    await flushPromises();

    const body = errorBodies()[0]!;
    expect(body.telemetryTrimmed).toMatchObject({ bodiesDropped: true });
    expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(200 * 1024);
  });

  it('sends with keepalive under 64 KB and without it above', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stubBrowser();

    bugdump.captureException(appError('small'));
    bugdump.setContext({ blob: 'x'.repeat(70 * 1024) });
    bugdump.captureException(appError('large'));
    await flushPromises();

    expect(errorCalls().map((call) => call.keepalive)).toEqual([true, false]);
  });
});

describe('a destroyed Bugdump instance', () => {
  it('ignores the fire-and-forget methods instead of throwing', () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    bugdump.destroy();

    expect(() => {
      bugdump.identify({ id: 'user-1' });
      bugdump.reset();
      bugdump.setContext({ plan: 'pro' });
      bugdump.setTheme('dark');
      bugdump.open({ taskId: 42 });
      bugdump.close();
      bugdump.identifyTask(42);
      bugdump.clearTask();
    }).not.toThrow();
    expect(bugdump.getUser()).toBeNull();
    expect(bugdump.getContext()).toEqual({});
    expect(bugdump.getActiveTaskId()).toBeNull();
    expect(bugdump.isWidgetOpen()).toBe(false);
  });

  it('still throws from the methods that return something', async () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    bugdump.destroy();

    await expect(bugdump.submit({ description: 'Broken' })).rejects.toThrow('This Bugdump instance was destroyed.');
    expect(() => bugdump.collectTelemetry()).toThrow('This Bugdump instance was destroyed.');
    expect(() => bugdump.getHttpClient()).toThrow('This Bugdump instance was destroyed.');
  });

  it('can be destroyed twice', () => {
    const bugdump = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    bugdump.destroy();

    expect(() => bugdump.destroy()).not.toThrow();
    expect(Bugdump.getInstance()).toBeNull();
  });

  it('leaves a newer instance in place when the stale one is destroyed again', () => {
    const stale = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    stale.destroy();
    const live = Bugdump.init({ apiKey: 'bd_live', endpoint: ENDPOINT });

    stale.destroy();

    expect(Bugdump.getInstance()).toBe(live);
    expect(live.getConfig()?.apiKey).toBe('bd_live');
    live.identify({ id: 'user-1' });
    expect(live.getUser()).toEqual({ id: 'user-1' });
  });

  it('is replaced by a fresh instance on the next init', () => {
    const first = Bugdump.init({ apiKey: 'bd_test', endpoint: ENDPOINT });
    first.destroy();

    const second = Bugdump.init({ apiKey: 'bd_next', endpoint: ENDPOINT });

    expect(second).not.toBe(first);
    expect(second.getConfig()?.apiKey).toBe('bd_next');
  });
});
