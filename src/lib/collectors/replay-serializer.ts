import { pack } from '@rrweb/packer';
import type { eventWithTime } from '@rrweb/types';

/**
 * Serialize rrweb events into a gzip-packed JSON blob.
 *
 * Each event is run through @rrweb/packer (fflate-backed), which compresses the
 * heavy string-valued snapshot fields (inlined CSS, attributes, text) ~5-10x.
 * The player unpacks transparently via `unpack`.
 */
export function serializeReplay(events: eventWithTime[]): Blob {
  const packed = events.map((event) => pack(event));
  return new Blob([JSON.stringify(packed)], { type: 'application/json' });
}

/** Byte size of the packed blob, used to decide whether trimming is needed. */
export function packedReplaySize(events: eventWithTime[]): number {
  return serializeReplay(events).size;
}
