import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCollector, type CapturedErrorDetails, type ErrorCollectorOptions } from './error';
import { BugdumpApiError } from '../http-client';

class FakeErrorEvent {
  readonly message: string;
  readonly error: unknown;
  readonly filename: string;
  readonly lineno: number;
  readonly colno: number;

  constructor(init: { message?: string; error?: unknown; filename?: string; lineno?: number; colno?: number }) {
    this.message = init.message ?? '';
    this.error = init.error;
    this.filename = init.filename ?? '';
    this.lineno = init.lineno ?? 0;
    this.colno = init.colno ?? 0;
  }
}

type Listener = (event: unknown) => void;

const SDK_FILE = 'https://bugdump.com/sdk/latest.js';
const APP_FILE = 'https://shop.test/assets/app.js';

let listeners: Map<string, Set<Listener>>;
let storage: Map<string, string>;
let captured: CapturedErrorDetails[];

function emit(type: string, event: unknown): void {
  for (const listener of listeners.get(type) ?? []) listener(event);
}

function throwError(error: Error): void {
  emit('error', new FakeErrorEvent({ message: `Uncaught ${error.message}`, error }));
}

function rejectWith(reason: unknown): void {
  emit('unhandledrejection', { reason });
}

function errorWithStack(message: string, stack: string, name = 'TypeError'): Error {
  const error = new Error(message);
  error.name = name;
  error.stack = `${name}: ${message}\n${stack}`;
  return error;
}

function appError(message = 'x is not a function'): Error {
  return errorWithStack(message, `    at onClick (${APP_FILE}:10:5)`);
}

function startCollector(options: Partial<ErrorCollectorOptions> = {}): ErrorCollector {
  const collector = new ErrorCollector({
    sampleRate: 1,
    sdkFiles: [],
    onCapture: (error) => captured.push(error),
    ...options,
  });
  collector.start();
  return collector;
}

beforeEach(() => {
  listeners = new Map();
  storage = new Map();
  captured = [];
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => listeners.get(type)?.delete(listener),
  });
  vi.stubGlobal('ErrorEvent', FakeErrorEvent);
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ErrorCollector listeners', () => {
  it('adds the error and rejection listeners on start and removes them on stop', () => {
    const collector = startCollector();

    expect(listeners.get('error')?.size).toBe(1);
    expect(listeners.get('unhandledrejection')?.size).toBe(1);

    collector.stop();

    expect(listeners.get('error')?.size).toBe(0);
    expect(listeners.get('unhandledrejection')?.size).toBe(0);
  });

  it('describes an uncaught error from its error object and location', () => {
    startCollector();
    const error = appError();

    emit(
      'error',
      new FakeErrorEvent({ message: 'Uncaught TypeError', error, filename: APP_FILE, lineno: 10, colno: 5 }),
    );

    expect(captured).toEqual([
      {
        type: 'TypeError',
        message: 'x is not a function',
        stack: error.stack,
        filename: APP_FILE,
        lineno: 10,
        colno: 5,
        mechanism: 'onerror',
        handled: false,
      },
    ]);
  });

  it('skips resource load failures, which are not ErrorEvents', () => {
    startCollector();

    emit('error', { type: 'error', target: { src: 'https://shop.test/missing.png' } });

    expect(captured).toEqual([]);
  });

  it('turns a rejection with a non-Error value into UnhandledRejection, cut to 500 characters', () => {
    startCollector();

    rejectWith({ code: 'x'.repeat(1_000) });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ type: 'UnhandledRejection', mechanism: 'unhandledrejection', handled: false });
    expect(captured[0]!.message).toHaveLength(500);
    expect(captured[0]!.message.startsWith('{"code":"xxx')).toBe(true);
  });

  it('keeps the name, message and stack of a rejected Error', () => {
    startCollector();
    const error = errorWithStack('Failed to load', `    at load (${APP_FILE}:3:1)`, 'ChunkLoadError');

    rejectWith(error);

    expect(captured[0]).toMatchObject({ type: 'ChunkLoadError', message: 'Failed to load', stack: error.stack });
  });
});

describe('ErrorCollector ignore rules', () => {
  it('drops "Script error." with no file and no line, but keeps one with a location', () => {
    startCollector();

    emit('error', new FakeErrorEvent({ message: 'Script error.', error: null }));
    expect(captured).toEqual([]);

    emit('error', new FakeErrorEvent({ message: 'Script error.', error: null, filename: APP_FILE, lineno: 1 }));
    expect(captured).toHaveLength(1);
  });

  it.each(['chrome-extension://abc', 'moz-extension://abc', 'safari-extension://abc', 'safari-web-extension://abc'])(
    'drops an error with a frame in %s',
    (origin) => {
      startCollector();

      throwError(errorWithStack('boom', `    at inject (${origin}/content.js:1:1)\n    at run (${APP_FILE}:2:2)`));

      expect(captured).toEqual([]);
    },
  );

  it.each(['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications.'])(
    'drops "%s"',
    (message) => {
      startCollector();

      emit('error', new FakeErrorEvent({ message, error: null }));

      expect(captured).toEqual([]);
    },
  );

  it('drops errors whose "type: message" matches ignoreErrors, by substring or RegExp', () => {
    startCollector({ ignoreErrors: ['TypeError: Load failed', /^NetworkError:/] });

    throwError(errorWithStack('Load failed', `    at a (${APP_FILE}:1:1)`));
    throwError(errorWithStack('offline', `    at b (${APP_FILE}:2:2)`, 'NetworkError'));
    throwError(appError('kept'));

    expect(captured.map((error) => error.message)).toEqual(['kept']);
  });
});

describe('ErrorCollector sampling', () => {
  it('sends nothing at a sampleRate of 0, even at a roll of 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    startCollector({ sampleRate: 0 });

    throwError(appError());

    expect(captured).toEqual([]);
  });

  it('sends everything at a sampleRate of 1, even at a roll of 0.9999', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    startCollector({ sampleRate: 1 });

    throwError(appError());

    expect(captured).toHaveLength(1);
  });

  it('at 0.5 keeps a roll of 0.49 and drops a roll of 0.5', () => {
    const random = vi.spyOn(Math, 'random');
    startCollector({ sampleRate: 0.5 });

    random.mockReturnValue(0.5);
    throwError(appError('first'));
    random.mockReturnValue(0.49);
    throwError(appError('second'));

    expect(captured.map((error) => error.message)).toEqual(['second']);
  });

  it('a dropped roll writes no session key, so a later keeping roll sends the same error', () => {
    const random = vi.spyOn(Math, 'random');
    startCollector({ sampleRate: 0.5 });

    random.mockReturnValue(0.9);
    throwError(appError());
    expect(storage.size).toBe(0);

    random.mockReturnValue(0.1);
    throwError(appError());
    expect(captured).toHaveLength(1);
  });

  it('a dropped roll uses no per-minute slot', () => {
    const random = vi.spyOn(Math, 'random');
    startCollector({ sampleRate: 0.5 });

    random.mockReturnValue(0.1);
    for (let i = 0; i < 9; i++) throwError(appError(`error ${i}`));
    random.mockReturnValue(0.9);
    throwError(appError('dropped'));
    random.mockReturnValue(0.1);
    throwError(appError('tenth'));

    expect(captured).toHaveLength(10);
    expect(captured[9]!.message).toBe('tenth');
  });

  it('never samples captureException', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const collector = startCollector({ sampleRate: 0 });

    collector.captureException(appError());

    expect(captured).toEqual([expect.objectContaining({ mechanism: 'manual', handled: true })]);
  });
});

describe('ErrorCollector noise control', () => {
  it('sends a distinct error once per session, across collectors that share the session', () => {
    startCollector();

    throwError(appError());
    throwError(appError());
    expect(captured).toHaveLength(1);

    startCollector();
    throwError(appError());
    expect(captured).toHaveLength(1);
  });

  it('treats the same message from another location as a different error', () => {
    startCollector();

    throwError(errorWithStack('boom', `    at a (${APP_FILE}:1:1)`));
    throwError(errorWithStack('boom', `    at b (${APP_FILE}:9:9)`));

    expect(captured).toHaveLength(2);
  });

  it('keeps at most 100 session keys', () => {
    vi.useFakeTimers();
    startCollector();

    for (let i = 0; i < 105; i++) {
      vi.advanceTimersByTime(60_000);
      throwError(appError(`error ${i}`));
    }

    expect(JSON.parse(storage.get('bugdump:sent-errors')!)).toHaveLength(100);
  });

  it('still dedupes in memory when sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    startCollector();

    throwError(appError());
    throwError(appError());

    expect(captured).toHaveLength(1);
  });

  it('sends at most 10 errors a minute, shared with captureException', () => {
    vi.useFakeTimers();
    const collector = startCollector();

    for (let i = 0; i < 9; i++) throwError(appError(`error ${i}`));
    collector.captureException(appError('manual'));
    throwError(appError('over the cap'));
    collector.captureException(appError('manual over the cap'));
    expect(captured).toHaveLength(10);

    vi.advanceTimersByTime(60_000);
    throwError(appError('next minute'));
    expect(captured).toHaveLength(11);
  });

  it('applies the once-per-session rule to captureException', () => {
    const collector = startCollector();

    collector.captureException(appError());
    collector.captureException(appError());

    expect(captured).toHaveLength(1);
  });

  it('stops every capture after halt, captureException included', () => {
    const collector = startCollector();

    collector.halt();
    throwError(appError());
    collector.captureException(appError('manual'));

    expect(captured).toEqual([]);
    expect(listeners.get('error')?.size).toBe(0);
  });
});

describe("ErrorCollector drops the SDK's own errors", () => {
  it('drops a BugdumpApiError and a message starting with [Bugdump]', () => {
    startCollector();

    rejectWith(new BugdumpApiError('REQUEST_TIMEOUT', 0));
    throwError(errorWithStack('[Bugdump] Something broke', `    at a (${APP_FILE}:1:1)`, 'Error'));

    expect(captured).toEqual([]);
  });

  it('drops an event whose frames with a file are all SDK files', () => {
    startCollector({ sdkFiles: [SDK_FILE] });

    throwError(
      errorWithStack(
        'boom',
        `    at a (${SDK_FILE}:1:100)\n    at Array.forEach (<anonymous>)\n    at ${SDK_FILE}:1:200`,
      ),
    );

    expect(captured).toEqual([]);
  });

  it('keeps an error from a sibling file next to the SDK', () => {
    startCollector({ sdkFiles: [SDK_FILE] });

    throwError(errorWithStack('boom', '    at a (https://bugdump.com/sdk/app.js:1:1)'));

    expect(captured).toHaveLength(1);
  });

  it("keeps an app error that passes through the SDK's fetch wrapper", () => {
    startCollector({ sdkFiles: [SDK_FILE] });

    rejectWith(
      errorWithStack('Failed to fetch', `    at window.fetch (${SDK_FILE}:1:500)\n    at loadCart (${APP_FILE}:40:12)`),
    );

    expect(captured).toHaveLength(1);
  });

  it('keeps a rejection with no stack at all', () => {
    startCollector({ sdkFiles: [SDK_FILE] });

    rejectWith('x');

    expect(captured).toEqual([expect.objectContaining({ type: 'UnhandledRejection', message: 'x' })]);
  });

  it('drops nothing by frames when there are no SDK files (the npm build)', () => {
    startCollector({ sdkFiles: [] });

    throwError(errorWithStack('boom', `    at a (${SDK_FILE}:1:100)`));

    expect(captured).toHaveLength(1);
  });
});
