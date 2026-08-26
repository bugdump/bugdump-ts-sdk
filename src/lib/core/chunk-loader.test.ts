import { describe, expect, it } from 'vitest';
import { REPLAY_CHUNK, loadChunk } from './chunk-loader';

// These run against the bundled branch (__BUGDUMP_IIFE__ is false under vitest), which is
// the same code path npm consumers use; only the import strategy differs from the IIFE build.
describe('loadChunk', () => {
  it('returns the same in-flight promise for repeated requests of one chunk', () => {
    const first = loadChunk(REPLAY_CHUNK);
    const second = loadChunk(REPLAY_CHUNK);

    expect(second).toBe(first);
  });

  it('resolves a known chunk to its module', async () => {
    const chunk = await loadChunk<{ record: unknown; pack: unknown }>(REPLAY_CHUNK);

    expect(typeof chunk.record).toBe('function');
    expect(typeof chunk.pack).toBe('function');
  });

  it('rejects an unknown chunk name', async () => {
    await expect(loadChunk('bugdump-nope.js')).rejects.toThrow('unknown chunk');
  });

  it('does not cache a failed load, so the next request retries', async () => {
    const first = loadChunk('bugdump-nope.js');
    await expect(first).rejects.toThrow();

    const second = loadChunk('bugdump-nope.js');
    await expect(second).rejects.toThrow();

    expect(second).not.toBe(first);
  });
});
