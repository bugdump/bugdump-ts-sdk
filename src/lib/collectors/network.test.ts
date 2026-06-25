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
