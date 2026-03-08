import { record } from '@rrweb/record';
import type { eventWithTime, listenerHandler } from '@rrweb/types';

const SESSION_REPLAY_WINDOW_MS = 60_000;
const MAX_BUFFER_SIZE = 5000;

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
      checkoutEveryNms: SESSION_REPLAY_WINDOW_MS,
      inlineStylesheet: true,
      inlineImages: true,
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
