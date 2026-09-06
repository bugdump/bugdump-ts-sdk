import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn();
const getInstanceMock = vi.fn();

vi.mock('../client', () => ({
  Bugdump: {
    init: (...args: unknown[]) => initMock(...args),
    getInstance: () => getInstanceMock(),
  },
}));

const { installCommandInterface, dispatchCommand } = await import('./command-queue');

type StubWindow = { bugdump?: { (...args: unknown[]): void; q?: unknown[] } };

function makeInstance() {
  return {
    identify: vi.fn(),
    reset: vi.fn(),
    setContext: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    identifyTask: vi.fn(),
    clearTask: vi.fn(),
    destroy: vi.fn(),
  };
}

/**
 * Replicates the documented inline stub. The real stub pushes `arguments` objects;
 * this one pushes equivalent non-array array-likes, since `arguments` itself is
 * rejected by prefer-rest-params in the public SDK repo.
 */
function installStub(win: StubWindow): void {
  const q: unknown[] = [];
  win.bugdump = Object.assign(
    (...args: unknown[]) => {
      q.push({ ...args, length: args.length });
    },
    { q },
  );
}

let win: StubWindow;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  win = {};
  (globalThis as { window?: unknown }).window = win;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe('installCommandInterface', () => {
  it('drains queued calls in order and forwards them to the API', () => {
    const instance = makeInstance();
    initMock.mockImplementation(() => getInstanceMock.mockReturnValue(instance));
    getInstanceMock.mockReturnValue(null);
    installStub(win);
    win.bugdump!('init', { apiKey: 'bd_test' });
    win.bugdump!('identify', { email: 'a@b.c' });

    installCommandInterface();

    expect(initMock).toHaveBeenCalledWith({ apiKey: 'bd_test' });
    expect(instance.identify).toHaveBeenCalledWith({ email: 'a@b.c' });
    expect(initMock.mock.invocationCallOrder[0]!).toBeLessThan(instance.identify.mock.invocationCallOrder[0]!);
  });

  it('replaces the stub so later calls dispatch immediately without queueing', () => {
    const instance = makeInstance();
    getInstanceMock.mockReturnValue(instance);
    installStub(win);

    installCommandInterface();
    win.bugdump!('open', { taskId: 7 });

    expect(instance.open).toHaveBeenCalledWith({ taskId: 7 });
    expect(win.bugdump!.q).toBeUndefined();
  });

  it('works when no stub was installed at all', () => {
    const instance = makeInstance();
    getInstanceMock.mockReturnValue(instance);

    installCommandInterface();
    win.bugdump!('close');

    expect(instance.close).toHaveBeenCalled();
  });

  it('keeps draining after a queued command throws', () => {
    const instance = makeInstance();
    getInstanceMock.mockReturnValue(instance);
    instance.identify.mockImplementation(() => {
      throw new Error('boom');
    });
    installStub(win);
    win.bugdump!('identify', { email: 'a@b.c' });
    win.bugdump!('close');

    installCommandInterface();

    expect(instance.close).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('dispatchCommand', () => {
  it('warns on an unknown command without touching the instance', () => {
    const instance = makeInstance();
    getInstanceMock.mockReturnValue(instance);

    dispatchCommand('collectTelemetry', []);

    expect(console.warn).toHaveBeenCalledWith('[Bugdump] Unknown command "collectTelemetry".');
  });

  it('warns when an instance command arrives before init', () => {
    getInstanceMock.mockReturnValue(null);

    dispatchCommand('identify', [{ email: 'a@b.c' }]);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Command "identify" ignored'));
  });

  it('warns when the command is not a string', () => {
    dispatchCommand({ apiKey: 'oops' }, []);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('must be a command name'));
    expect(initMock).not.toHaveBeenCalled();
  });
});
