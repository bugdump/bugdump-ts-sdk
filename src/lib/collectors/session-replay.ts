import { record } from '@rrweb/record';
import type { eventWithTime, listenerHandler } from '@rrweb/types';

const BUFFER_WINDOW_MS = 60_000;
const MAX_BUFFER_SIZE = 5000;

export class SessionReplayCollector {
  private buffer: eventWithTime[] = [];
  private stopFn: listenerHandler | null = null;
  private active = false;

  start(): void {
    if (this.active) return;
    this.active = true;

    const stop = record({
      emit: (event: eventWithTime) => {
        this.buffer.push(event);
        this.pruneBuffer();
      },
      checkoutEveryNms: BUFFER_WINDOW_MS,
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

  stop(): void {
    if (!this.active) return;
    this.active = false;

    if (this.stopFn) {
      this.stopFn();
      this.stopFn = null;
    }
  }

  snapshot(sinceTimestamp?: number): eventWithTime[] {
    if (this.active && record.takeFullSnapshot) {
      record.takeFullSnapshot();
    }

    const events = this.extractReplayableSlice();

    if (sinceTimestamp !== undefined) {
      return events.filter((e) => e.timestamp >= sinceTimestamp);
    }

    return events;
  }

  flush(): eventWithTime[] {
    const events = this.snapshot();
    this.buffer = [];
    return events;
  }

  private extractReplayableSlice(): eventWithTime[] {
    const cutoff = Date.now() - BUFFER_WINDOW_MS;

    let lastSnapshotIndex = -1;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i]?.type === 2) {
        lastSnapshotIndex = i;
        break;
      }
    }

    if (lastSnapshotIndex === -1) return [];

    let startIndex = lastSnapshotIndex;
    if (startIndex > 0 && this.buffer[startIndex - 1]?.type === 4) {
      startIndex = startIndex - 1;
    }

    const sliceFromSnapshot = this.buffer.slice(startIndex);

    let bestSnapshotStart = -1;
    for (let i = 0; i < this.buffer.length; i++) {
      const event = this.buffer[i];
      if (!event) continue;
      if (event.timestamp < cutoff) continue;

      if (event.type === 2) {
        bestSnapshotStart = i;
        break;
      }
      if (event.type === 4 && this.buffer[i + 1]?.type === 2) {
        bestSnapshotStart = i;
        break;
      }
    }

    if (bestSnapshotStart >= 0) {
      const sliceFromCutoff = this.buffer.slice(bestSnapshotStart);
      if (sliceFromCutoff.length > sliceFromSnapshot.length) {
        return sliceFromCutoff;
      }
    }

    return sliceFromSnapshot;
  }

  private pruneBuffer(): void {
    if (this.buffer.length <= MAX_BUFFER_SIZE) return;

    const cutoff = Date.now() - BUFFER_WINDOW_MS;
    const firstValidIndex = this.buffer.findIndex((e) => e.timestamp >= cutoff);

    if (firstValidIndex === -1) {
      const lastSnapshot = this.findLastSnapshotStart();
      this.buffer = lastSnapshot >= 0 ? this.buffer.slice(lastSnapshot) : [];
      return;
    }

    if (firstValidIndex > 0) {
      let snapshotIndex = -1;
      for (let i = firstValidIndex; i >= 0; i--) {
        if (this.buffer[i]?.type === 2) {
          snapshotIndex = i;
          break;
        }
      }

      if (snapshotIndex >= 0) {
        const start = snapshotIndex > 0 && this.buffer[snapshotIndex - 1]?.type === 4
          ? snapshotIndex - 1
          : snapshotIndex;
        this.buffer = this.buffer.slice(start);
      } else {
        this.buffer = this.buffer.slice(firstValidIndex);
      }
    }

    if (this.buffer.length > MAX_BUFFER_SIZE) {
      const lastSnapshot = this.findLastSnapshotStart();
      if (lastSnapshot > 0) {
        this.buffer = this.buffer.slice(lastSnapshot);
      } else {
        this.buffer = this.buffer.slice(-MAX_BUFFER_SIZE);
      }
    }
  }

  private findLastSnapshotStart(): number {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i]?.type === 2) {
        return i > 0 && this.buffer[i - 1]?.type === 4 ? i - 1 : i;
      }
    }
    return -1;
  }
}
