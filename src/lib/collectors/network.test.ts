import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkCollector } from './network';

const MAX_BODY_SIZE = 32_768;

// The collector patches window.fetch and XMLHttpRequest.prototype. Node has neither,
// so provide minimal shims: a `window` whose fetch we control, and a no-op XHR class
// with a prototype (so patchXhr/restoreXhr don't throw). We only exercise the fetch path.
class FakeXHR {
  open(): void {}
  send(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

interface TestGlobals {
  window?: { fetch: typeof fetch };
  XMLHttpRequest?: unknown;
}

const g = globalThis as unknown as TestGlobals;

function setBackingFetch(response: Response): void {
  g.window!.fetch = async () => response;
}

beforeEach(() => {
  g.window = { fetch: async () => new Response('') };
  g.XMLHttpRequest = FakeXHR;
});

afterEach(() => {
  delete g.window;
  delete g.XMLHttpRequest;
  vi.restoreAllMocks();
});

function expectedTruncation(text: string): string {
  return text.length <= MAX_BODY_SIZE ? text : text.slice(0, MAX_BODY_SIZE) + '…[truncated]';
}

describe('NetworkCollector body capture (readCappedBody via fetch)', () => {
  it('captures a small response body verbatim', async () => {
    const body = '{"ok":true,"value":42}';
    setBackingFetch(new Response(body, { status: 200 }));
    const collector = new NetworkCollector({ captureBodies: true });
    collector.start();

    await g.window!.fetch('https://api.example.com/data');
    const entries = collector.snapshot();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.responseBody).toBe(body);
    collector.stop();
  });

  it('truncates a large response body to the cap, identical to full-decode truncation', async () => {
    const body = 'a'.repeat(100_000);
    setBackingFetch(new Response(body, { status: 200 }));
    const collector = new NetworkCollector({ captureBodies: true });
    collector.start();

    await g.window!.fetch('https://api.example.com/big');
    const entries = collector.snapshot();

    expect(entries[0]!.responseBody).toBe(expectedTruncation(body));
    expect(entries[0]!.responseBody!.endsWith('…[truncated]')).toBe(true);
    collector.stop();
  });

  it('truncates correctly when a multibyte char straddles the cap boundary', async () => {
    // Place a 🐛 (surrogate pair) right at the 32768th char, then trailing bytes,
    // so a naive byte-cap could split it. The streaming reader must match a full decode.
    const body = 'a'.repeat(MAX_BODY_SIZE - 1) + '🐛' + 'b'.repeat(500);
    setBackingFetch(new Response(body, { status: 200 }));
    const collector = new NetworkCollector({ captureBodies: true });
    collector.start();

    await g.window!.fetch('https://api.example.com/emoji');
    const entries = collector.snapshot();

    expect(entries[0]!.responseBody).toBe(expectedTruncation(body));
    collector.stop();
  });

  it('does not consume the response the caller receives (clone is read, not the original)', async () => {
    const body = 'caller still reads this';
    setBackingFetch(new Response(body, { status: 200 }));
    const collector = new NetworkCollector({ captureBodies: true });
    collector.start();

    const response = await g.window!.fetch('https://api.example.com/data');
    // The application must still be able to read the body — the collector read a clone.
    expect(await response.text()).toBe(body);
    collector.stop();
  });

  it('skips body capture entirely when captureBodies is false', async () => {
    setBackingFetch(new Response('should-not-capture', { status: 200 }));
    const collector = new NetworkCollector({ captureBodies: false });
    collector.start();

    await g.window!.fetch('https://api.example.com/data');
    const entries = collector.snapshot();

    expect(entries[0]!.responseBody).toBeNull();
    collector.stop();
  });

  it('records an entry with no body for an empty response', async () => {
    setBackingFetch(new Response(null, { status: 204 }));
    const collector = new NetworkCollector({ captureBodies: true });
    collector.start();

    await g.window!.fetch('https://api.example.com/empty');
    const entries = collector.snapshot();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.responseBody).toBe('');
    expect(entries[0]!.status).toBe(204);
    collector.stop();
  });
});

describe("NetworkCollector skips the SDK's own requests", () => {
  const ENDPOINT = 'https://api.bugdump.test';

  class LoadingXHR {
    status = 200;
    statusText = 'OK';
    responseText = '';
    private listeners: Array<() => void> = [];
    open(): void {}
    send(): void {
      for (const listener of this.listeners) listener();
    }
    addEventListener(_type: string, listener: () => void): void {
      this.listeners.push(listener);
    }
    removeEventListener(): void {}
    getAllResponseHeaders(): string {
      return '';
    }
  }

  it('does not record fetches to the widget API, but records the rest', async () => {
    const collector = new NetworkCollector({ endpoint: ENDPOINT });
    collector.start();

    await g.window!.fetch(`${ENDPOINT}/api/widget/v1/errors`, { method: 'POST' });
    await g.window!.fetch(`${ENDPOINT}/api/other`);
    await g.window!.fetch('https://shop.test/api/cart');

    expect(collector.snapshot().map((entry) => entry.url)).toEqual([
      `${ENDPOINT}/api/other`,
      'https://shop.test/api/cart',
    ]);
    collector.stop();
  });

  it('does not record XHRs to the widget API, but records the rest', () => {
    g.XMLHttpRequest = LoadingXHR;
    const collector = new NetworkCollector({ endpoint: ENDPOINT });
    collector.start();

    for (const url of [`${ENDPOINT}/api/widget/v1/reports`, 'https://shop.test/api/cart']) {
      const xhr = new LoadingXHR() as unknown as XMLHttpRequest;
      xhr.open('POST', url);
      xhr.send();
    }

    expect(collector.snapshot().map((entry) => entry.url)).toEqual(['https://shop.test/api/cart']);
    collector.stop();
  });
});
