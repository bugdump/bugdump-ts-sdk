import { afterEach, describe, expect, it } from 'vitest';
import { getDebugIdsForStack } from './debug-ids';

const V8_FILE = 'https://shop.test/assets/index-BxT3kQ9a.js';
const FIREFOX_FILE = 'https://shop.test/assets/vendor-C9_x-1Qe.js';
const SAFARI_FILE = 'https://shop.test/assets/chunk-D4f8a1Zx.js';

const V8_KEY = `Error\n    at ${V8_FILE}:1:95\n    at ${V8_FILE}:1:240`;
const FIREFOX_KEY = `@${FIREFOX_FILE}:1:95\n@${FIREFOX_FILE}:1:240\n`;
const SAFARI_KEY = `@${SAFARI_FILE}:1:95\nglobal code@${SAFARI_FILE}:1:240`;

function debugId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function errorStackThrough(...files: string[]): string {
  return ['TypeError: boom', ...files.map((file, i) => `    at fn${i} (${file}:1:${i + 10})`)].join('\n');
}

afterEach(() => {
  delete globalThis._bugdumpDebugIds;
});

describe('getDebugIdsForStack', () => {
  it('turns V8, Firefox and Safari stack keys into their script URLs', () => {
    globalThis._bugdumpDebugIds = { [V8_KEY]: debugId(1), [FIREFOX_KEY]: debugId(2), [SAFARI_KEY]: debugId(3) };

    expect(getDebugIdsForStack(errorStackThrough(V8_FILE, FIREFOX_FILE, SAFARI_FILE))).toEqual({
      [V8_FILE]: debugId(1),
      [FIREFOX_FILE]: debugId(2),
      [SAFARI_FILE]: debugId(3),
    });
  });

  it('returns only the files in the error stack', () => {
    globalThis._bugdumpDebugIds = { [V8_KEY]: debugId(1), [FIREFOX_KEY]: debugId(2) };

    expect(getDebugIdsForStack(errorStackThrough(FIREFOX_FILE))).toEqual({ [FIREFOX_FILE]: debugId(2) });
  });

  it('matches the filename when the error has no stack', () => {
    globalThis._bugdumpDebugIds = { [V8_KEY]: debugId(1), [FIREFOX_KEY]: debugId(2) };

    expect(getDebugIdsForStack(undefined, V8_FILE)).toEqual({ [V8_FILE]: debugId(1) });
  });

  it('returns at most 100 entries', () => {
    const files = Array.from({ length: 150 }, (_, i) => `https://shop.test/assets/chunk-${i}.js`);
    globalThis._bugdumpDebugIds = Object.fromEntries(
      files.map((file, i) => [`Error\n    at ${file}:1:95`, debugId(i)]),
    );

    expect(Object.keys(getDebugIdsForStack(errorStackThrough(...files)))).toHaveLength(100);
  });

  it('picks up a key registered after the first call, as lazy chunks load', () => {
    const registry: Record<string, string> = { [V8_KEY]: debugId(1) };
    globalThis._bugdumpDebugIds = registry;
    const stack = errorStackThrough(V8_FILE, FIREFOX_FILE);

    expect(getDebugIdsForStack(stack)).toEqual({ [V8_FILE]: debugId(1) });

    registry[FIREFOX_KEY] = debugId(2);

    expect(getDebugIdsForStack(stack)).toEqual({ [V8_FILE]: debugId(1), [FIREFOX_FILE]: debugId(2) });
  });

  it('gives {} with no registry', () => {
    expect(getDebugIdsForStack(errorStackThrough(V8_FILE))).toEqual({});
  });

  it('gives {} when reading the registry throws', () => {
    Object.defineProperty(globalThis, '_bugdumpDebugIds', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    expect(getDebugIdsForStack(errorStackThrough(V8_FILE))).toEqual({});
  });
});
