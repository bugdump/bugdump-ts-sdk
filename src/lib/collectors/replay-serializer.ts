import { pack } from '@rrweb/packer';
import type { eventWithTime } from '@rrweb/types';

/**
 * Serializes rrweb events into a gzip-packed JSON blob, packing each event at most
 * once and reusing the result across size checks and final serialization.
 *
 * Each event is run through @rrweb/packer (fflate-backed), which compresses the heavy
 * string-valued snapshot fields (inlined CSS, attributes, text) ~5-10x; the player
 * unpacks transparently via `unpack`. `pack` (gzip via fflate) is the dominant cost
 * when preparing a replay attachment, and trimming probes several overlapping slices
 * of the same events — without memoization every probe re-packs the whole slice, then
 * the final blob packs them yet again. Keyed by event reference (pack is pure per
 * event), so the cached output is identical to calling `pack` directly.
 */
export class ReplayPacker {
  private cache = new WeakMap<eventWithTime, string>();

  private packEvent(event: eventWithTime): string {
    let packed = this.cache.get(event);
    if (packed === undefined) {
      packed = pack(event);
      this.cache.set(event, packed);
    }
    return packed;
  }

  serialize(events: eventWithTime[]): Blob {
    const packed = events.map((event) => this.packEvent(event));
    return new Blob([JSON.stringify(packed)], { type: 'application/json' });
  }

  size(events: eventWithTime[]): number {
    return this.serialize(events).size;
  }
}
