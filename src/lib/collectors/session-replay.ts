import { record } from '@rrweb/record';
import type { eventWithTime, listenerHandler } from '@rrweb/types';

const BUFFER_WINDOW_MS = 30_000;

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
        this.pruneOldEvents();
      },
      sampling: {
        mousemove: true,
        mouseInteraction: true,
        scroll: 150,
        input: 'last',
      },
      blockClass: 'bugdump-block',
      maskAllInputs: true,
    });

    if (stop) {
      this.stopFn = stop;
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

  flush(): eventWithTime[] {
    this.pruneOldEvents();
    const events = [...this.buffer];
    this.buffer = [];
    return events;
  }

  private pruneOldEvents(): void {
    const cutoff = Date.now() - BUFFER_WINDOW_MS;
    const firstValidIndex = this.buffer.findIndex((e) => e.timestamp >= cutoff);

    if (firstValidIndex === -1) {
      this.buffer = [];
    } else if (firstValidIndex > 0) {
      this.buffer = this.buffer.slice(firstValidIndex);
    }
  }
}
