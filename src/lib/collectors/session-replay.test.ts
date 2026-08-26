import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { eventWithTime } from '@rrweb/types';

const loadReplayChunkMock = vi.fn();
const replayChunkMock = vi.fn();

vi.mock('./replay-chunk', () => ({
  loadReplayChunk: (...args: unknown[]) => loadReplayChunkMock(...args),
  replayChunk: (...args: unknown[]) => replayChunkMock(...args),
}));

const { SessionReplayCollector, trimReplayToBudget } = await import('./session-replay');

type RecordOptions = { emit: (event: eventWithTime) => void };

const stopFn = vi.fn();
let emit: ((event: eventWithTime) => void) | null = null;
const record = Object.assign(
  vi.fn((options: RecordOptions) => {
    emit = options.emit;
    return stopFn;
  }),
  { takeFullSnapshot: vi.fn() },
);
const chunk = { record, pack: vi.fn() };

/** A loadReplayChunk whose resolution the test controls. */
function deferChunkLoad() {
  let resolve!: () => void;
  const gate = new Promise<void>((r) => {
    resolve = r;
  });
  loadReplayChunkMock.mockImplementation(async () => {
    await gate;
    return chunk;
  });
  return { resolve };
}

function metaEvent(ts: number): eventWithTime {
  return { type: 4, data: { href: 'https://x', width: 1, height: 1 }, timestamp: ts } as eventWithTime;
}

function snapshotEvent(ts: number): eventWithTime {
  return { type: 2, data: {}, timestamp: ts } as eventWithTime;
}

function incrementalEvent(ts: number): eventWithTime {
  return { type: 3, data: { source: 1 }, timestamp: ts } as eventWithTime;
}

beforeEach(() => {
  vi.clearAllMocks();
  emit = null;
  loadReplayChunkMock.mockResolvedValue(chunk);
  replayChunkMock.mockReturnValue(chunk);
  // schedulePostLoadSnapshot reads document.readyState after the recorder attaches
  (globalThis as { document?: unknown }).document = { readyState: 'complete' };
});

describe('SessionReplayCollector.start', () => {
  it('loads the replay chunk and attaches the recorder', async () => {
    const collector = new SessionReplayCollector();

    await collector.start();

    expect(loadReplayChunkMock).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(collector.isActive).toBe(true);
  });

  it('buffers emitted events into the replay window', async () => {
    const collector = new SessionReplayCollector();
    await collector.start();

    const now = Date.now();
    emit!(metaEvent(now));
    emit!(snapshotEvent(now + 1));
    emit!(incrementalEvent(now + 2));

    expect(collector.getSessionReplay()).toHaveLength(3);
  });

  it('does not attach the recorder when stopped while the chunk is still loading', async () => {
    const { resolve } = deferChunkLoad();
    const collector = new SessionReplayCollector();

    const pending = collector.start();
    collector.stop();
    resolve();
    await pending;

    expect(record).not.toHaveBeenCalled();
  });

  it('attaches exactly one recorder when restarted while the chunk is still loading', async () => {
    const { resolve } = deferChunkLoad();
    const collector = new SessionReplayCollector();

    const first = collector.start();
    collector.stop();
    const second = collector.start();
    resolve();
    await Promise.all([first, second]);

    expect(record).toHaveBeenCalledTimes(1);
    expect(collector.isActive).toBe(true);
  });
});

describe('SessionReplayCollector.stop', () => {
  it('stops the attached recorder', async () => {
    const collector = new SessionReplayCollector();
    await collector.start();

    collector.stop();

    expect(stopFn).toHaveBeenCalledTimes(1);
    expect(collector.isActive).toBe(false);
  });
});

describe('SessionReplayCollector.startRecording', () => {
  it('takes a baseline snapshot and marks recording', async () => {
    const collector = new SessionReplayCollector();
    await collector.start();
    const now = Date.now();
    emit!(metaEvent(now));
    emit!(snapshotEvent(now + 1));

    collector.startRecording();

    expect(record.takeFullSnapshot).toHaveBeenCalled();
    expect(collector.isRecording).toBe(true);
  });

  it('is a no-op while the chunk is not loaded', async () => {
    const collector = new SessionReplayCollector();
    await collector.start();
    replayChunkMock.mockReturnValue(null);

    collector.startRecording();

    expect(collector.isRecording).toBe(false);
  });

  it('is a no-op when the collector was never started', () => {
    const collector = new SessionReplayCollector();

    collector.startRecording();

    expect(collector.isRecording).toBe(false);
    expect(record.takeFullSnapshot).not.toHaveBeenCalled();
  });
});

describe('trimReplayToBudget', () => {
  const sizeOf = (slice: eventWithTime[]) => slice.length * 100;

  it('returns the original slice when it fits, including exactly at the budget', () => {
    const events = [metaEvent(1), snapshotEvent(2), incrementalEvent(3)];

    expect(trimReplayToBudget(events, 300, sizeOf)).toBe(events);
    expect(trimReplayToBudget(events, 1000, sizeOf)).toBe(events);
  });

  it('drops the oldest window down to the first snapshot start that fits', () => {
    const events = [
      metaEvent(1),
      snapshotEvent(2),
      incrementalEvent(3),
      incrementalEvent(4),
      metaEvent(5),
      snapshotEvent(6),
      incrementalEvent(7),
    ];

    const trimmed = trimReplayToBudget(events, 300, sizeOf);

    // The second window starts at the META event preceding its FULL_SNAPSHOT.
    expect(trimmed).toEqual([metaEvent(5), snapshotEvent(6), incrementalEvent(7)]);
  });

  it('returns an empty array when even the last snapshot window is too large', () => {
    const events = [metaEvent(1), snapshotEvent(2), incrementalEvent(3), incrementalEvent(4)];

    expect(trimReplayToBudget(events, 100, sizeOf)).toEqual([]);
  });

  it('returns an empty input unchanged', () => {
    expect(trimReplayToBudget([], 100, sizeOf)).toEqual([]);
  });
});
