import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bugdump } from './client';
import { BugdumpApiError } from './http-client';

const ENDPOINT = 'https://api.test';
const S3_URL = 'https://s3.test/bucket';

interface Call {
  url: string;
  body: unknown;
}

let calls: Call[];
let reportStatus: number;
let reportError: string;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
  calls.push({ url: input, body });

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

function reportBody(): Record<string, unknown> {
  const report = calls.find((c) => c.url === `${ENDPOINT}/api/widget/v1/reports`);
  return report?.body as Record<string, unknown>;
}

beforeEach(() => {
  calls = [];
  reportStatus = 201;
  reportError = 'VALIDATION_FAILED';
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  Bugdump.getInstance()?.destroy();
  vi.unstubAllGlobals();
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
});
