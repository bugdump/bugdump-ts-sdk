import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn();

vi.mock('./client', () => ({
  Bugdump: { init: (...args: unknown[]) => initMock(...args) },
}));

const { runAutoInit } = await import('./auto-init');

function stubScriptTag(attributes: Record<string, string>): void {
  vi.stubGlobal('document', {
    currentScript: {
      getAttribute: (name: string) => attributes[name] ?? null,
      hasAttribute: (name: string) => name in attributes,
    },
    querySelectorAll: () => [],
  });
}

function initConfig(): Record<string, unknown> {
  return initMock.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  initMock.mockReset();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runAutoInit error capture attributes', () => {
  it('passes data-capture-errors="false" as false', () => {
    stubScriptTag({ 'data-api-key': 'bd_test', 'data-capture-errors': 'false' });

    runAutoInit();

    expect(initConfig().captureErrors).toBe(false);
  });

  it('passes data-sample-rate="0" as 0', () => {
    stubScriptTag({ 'data-api-key': 'bd_test', 'data-sample-rate': '0' });

    runAutoInit();

    expect(initConfig().sampleRate).toBe(0);
  });

  it('passes data-sample-rate="0.25" and data-release as given', () => {
    stubScriptTag({ 'data-api-key': 'bd_test', 'data-sample-rate': '0.25', 'data-release': 'abc123' });

    runAutoInit();

    expect(initConfig()).toMatchObject({ sampleRate: 0.25, release: 'abc123' });
  });

  it('ignores empty attributes instead of reading them as 0 or false', () => {
    stubScriptTag({
      'data-api-key': 'bd_test',
      'data-sample-rate': '',
      'data-capture-errors': ' ',
      'data-release': '',
    });

    runAutoInit();

    expect(initConfig()).not.toHaveProperty('sampleRate');
    expect(initConfig()).not.toHaveProperty('captureErrors');
    expect(initConfig()).not.toHaveProperty('release');
  });

  it('passes none of them when the attributes are absent', () => {
    stubScriptTag({ 'data-api-key': 'bd_test' });

    runAutoInit();

    expect(initConfig()).toEqual({ apiKey: 'bd_test' });
  });
});

describe('runAutoInit without a key', () => {
  it('skips quietly when the current script has no data-api-key attribute', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubScriptTag({ src: 'https://shop.test/_next/static/chunks/main.js' });

    runAutoInit();

    expect(initMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('still warns when data-api-key is there but empty', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubScriptTag({ 'data-api-key': '' });

    runAutoInit();

    expect(initMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('data-api-key is missing or empty'));
  });
});
