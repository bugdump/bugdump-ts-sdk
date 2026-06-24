import { record } from '@rrweb/record';
import type { eventWithTime, listenerHandler } from '@rrweb/types';

const SESSION_REPLAY_WINDOW_MS = 180_000;
const CHECKOUT_INTERVAL_MS = 60_000;
const MAX_BUFFER_SIZE = 15_000;

const META_EVENT = 4;
const FULL_SNAPSHOT_EVENT = 2;

export class SessionReplayCollector {
  private buffer: eventWithTime[] = [];
  private stopFn: listenerHandler | null = null;
  private active = false;
  private recordingStartIndex: number | null = null;

  start(): void {
    if (this.active) return;
    this.active = true;

    const stop = record({
      emit: (event: eventWithTime) => {
        this.buffer.push(event);
        this.pruneOldEvents();
      },
      checkoutEveryNms: CHECKOUT_INTERVAL_MS,
      inlineStylesheet: true,
      inlineImages: false,
      collectFonts: true,
      sampling: {
        mousemove: 50,
        mouseInteraction: true,
        scroll: 150,
        input: 'last',
        media: 800,
      },
      slimDOMOptions: {
        script: true,
        comment: true,
        headFavicon: true,
        headWhitespace: true,
        headMetaDescKeywords: true,
        headMetaSocial: true,
        headMetaRobots: true,
        headMetaHttpEquiv: true,
        headMetaAuthorship: true,
      },
      blockClass: 'bugdump-block',
      maskAllInputs: true,
    });

    if (stop) {
      this.stopFn = stop;
    }

    this.schedulePostLoadSnapshot();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.recordingStartIndex = null;

    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }
  }

  /**
   * Begin a user-initiated recording.
   * Takes a full snapshot immediately to establish a clean DOM baseline.
   */
  startRecording(): void {
    if (!this.active || this.recordingStartIndex !== null) return;

    if (record.takeFullSnapshot) {
      record.takeFullSnapshot();
    }

    this.recordingStartIndex = this.findLastSnapshotStart();
  }

  /**
   * End a user-initiated recording.
   * Returns all events from the baseline snapshot to now.
   */
  stopRecording(): eventWithTime[] {
    if (this.recordingStartIndex === null) return [];

    const startIndex = this.recordingStartIndex;
    this.recordingStartIndex = null;

    if (startIndex < 0 || startIndex >= this.buffer.length) return [];
    return this.buffer.slice(startIndex);
  }

  get isRecording(): boolean {
    return this.recordingStartIndex !== null;
  }

  /**
   * Get the rolling session replay window (~last 60s).
   * Does NOT take a new snapshot or modify the buffer.
   */
  getSessionReplay(): eventWithTime[] {
    return this.extractReplayableSlice();
  }

  /** @deprecated Use getSessionReplay() instead. */
  snapshot(): eventWithTime[] {
    return this.getSessionReplay();
  }

  /** @deprecated Use getSessionReplay() instead. */
  flush(): eventWithTime[] {
    return this.getSessionReplay();
  }

  private schedulePostLoadSnapshot(): void {
    const takeSnapshot = () => {
      if (this.active && record.takeFullSnapshot) {
        record.takeFullSnapshot();
      }
    };

    if (document.readyState === 'complete') {
      setTimeout(takeSnapshot, 100);
    } else {
      window.addEventListener('load', () => setTimeout(takeSnapshot, 100), { once: true });
    }
  }

  private extractReplayableSlice(): eventWithTime[] {
    if (this.buffer.length === 0) return [];

    const cutoff = Date.now() - SESSION_REPLAY_WINDOW_MS;

    // Find the earliest full snapshot within the time window for maximum context
    for (let i = 0; i < this.buffer.length; i++) {
      const event = this.buffer[i];
      if (!event || event.timestamp < cutoff) continue;

      if (event.type === FULL_SNAPSHOT_EVENT) {
        const start = i > 0 && this.buffer[i - 1]?.type === META_EVENT ? i - 1 : i;
        return this.buffer.slice(start);
      }
      if (event.type === META_EVENT && this.buffer[i + 1]?.type === FULL_SNAPSHOT_EVENT) {
        return this.buffer.slice(i);
      }
    }

    // No snapshot in time window — fall back to the most recent snapshot
    const lastStart = this.findLastSnapshotStart();
    if (lastStart >= 0) {
      return this.buffer.slice(lastStart);
    }

    return [];
  }

  private pruneOldEvents(): void {
    if (this.buffer.length <= MAX_BUFFER_SIZE) return;

    const cutoff = Date.now() - SESSION_REPLAY_WINDOW_MS;

    // Determine the earliest index we must keep
    let mustKeepFrom = this.buffer.length;

    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i]!.timestamp >= cutoff) {
        mustKeepFrom = i;
        break;
      }
    }

    // Protect active recording events from pruning
    if (this.recordingStartIndex !== null) {
      mustKeepFrom = Math.min(mustKeepFrom, this.recordingStartIndex);
    }

    // Find a snapshot boundary at or before mustKeepFrom to serve as base
    let pruneUpTo = 0;
    for (let i = Math.min(mustKeepFrom, this.buffer.length - 1); i >= 0; i--) {
      if (this.buffer[i]?.type === FULL_SNAPSHOT_EVENT) {
        pruneUpTo = i > 0 && this.buffer[i - 1]?.type === META_EVENT ? i - 1 : i;
        break;
      }
    }

    if (pruneUpTo > 0) {
      this.buffer = this.buffer.slice(pruneUpTo);
      if (this.recordingStartIndex !== null) {
        this.recordingStartIndex -= pruneUpTo;
      }
    }

    // If still too large, keep from most recent snapshot
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      const lastStart = this.findLastSnapshotStart();
      if (lastStart > 0) {
        if (this.recordingStartIndex !== null && lastStart > this.recordingStartIndex) {
          // Can't prune further without losing recording data
          this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
          this.recordingStartIndex = null;
        } else {
          this.buffer = this.buffer.slice(lastStart);
          if (this.recordingStartIndex !== null) {
            this.recordingStartIndex -= lastStart;
          }
        }
      }
    }
  }

  private findLastSnapshotStart(): number {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i]?.type === FULL_SNAPSHOT_EVENT) {
        return i > 0 && this.buffer[i - 1]?.type === META_EVENT ? i - 1 : i;
      }
    }
    return -1;
  }
}

/**
 * Find the start indices of replayable segments — each is a META event (or the
 * FULL_SNAPSHOT directly) that begins a self-contained playback window. The
 * earliest one carries the most context; later ones are smaller, dropping the
 * oldest part of the session.
 */
function snapshotStarts(events: eventWithTime[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < events.length; i++) {
    if (events[i]?.type !== FULL_SNAPSHOT_EVENT) continue;
    starts.push(i > 0 && events[i - 1]?.type === META_EVENT ? i - 1 : i);
  }
  return starts;
}

/**
 * Trim a replay event slice down to the largest most-recent snapshot window
 * whose serialized size is within `maxBytes`. Returns the original slice when it
 * already fits, or an empty array if even the last snapshot alone is too large.
 * `sizeOf` receives a candidate slice and returns its serialized byte size, so
 * the caller decides the wire format (e.g. packed JSON).
 */
export function trimReplayToBudget(
  events: eventWithTime[],
  maxBytes: number,
  sizeOf: (slice: eventWithTime[]) => number,
): eventWithTime[] {
  if (events.length === 0) return events;
  if (sizeOf(events) <= maxBytes) return events;

  const starts = snapshotStarts(events);
  // Walk from the earliest snapshot start to the latest; the first candidate
  // that fits keeps the most history while staying under budget.
  for (const start of starts) {
    if (start === 0) continue;
    const slice = events.slice(start);
    if (sizeOf(slice) <= maxBytes) return slice;
  }

  return [];
}
