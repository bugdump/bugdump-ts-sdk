import { describe, it, expect } from 'vitest';
import { pack } from '@rrweb/packer';
import type { eventWithTime } from '@rrweb/types';
import { ReplayPacker } from './replay-serializer';

function metaEvent(ts: number): eventWithTime {
  return { type: 4, data: { href: 'https://x', width: 100, height: 100 }, timestamp: ts } as eventWithTime;
}

function incrementalEvent(ts: number): eventWithTime {
  return { type: 3, data: { source: 1, positions: [{ x: ts, y: ts, id: 1, timeOffset: 0 }] }, timestamp: ts } as eventWithTime;
}

async function blobText(blob: Blob): Promise<string> {
  return await blob.text();
}

describe('ReplayPacker', () => {
  it('produces output identical to packing each event directly', async () => {
    const events = [metaEvent(1), incrementalEvent(2), incrementalEvent(3)];
    const expected = JSON.stringify(events.map((e) => pack(e)));

    const packer = new ReplayPacker();
    const blob = packer.serialize(events);

    expect(await blobText(blob)).toBe(expected);
  });

  it('returns a size equal to the serialized blob size', () => {
    const events = [metaEvent(1), incrementalEvent(2)];
    const packer = new ReplayPacker();

    expect(packer.size(events)).toBe(packer.serialize(events).size);
  });

  it('reuses cached packing across overlapping slices (same bytes for shared events)', async () => {
    const events = [metaEvent(1), incrementalEvent(2), incrementalEvent(3), incrementalEvent(4)];
    const packer = new ReplayPacker();

    // Serializing the full set and a sub-slice must agree on the shared tail events:
    // the packer caches per event reference, so the packed string for each shared event
    // is identical regardless of which slice asked for it.
    const fullText = await blobText(packer.serialize(events));
    const tailText = await blobText(packer.serialize(events.slice(2)));

    const fullPacked: string[] = JSON.parse(fullText);
    const tailPacked: string[] = JSON.parse(tailText);

    expect(tailPacked).toEqual(fullPacked.slice(2));
  });

  it('packs identically whether or not memoization warmed the cache first', async () => {
    const events = [metaEvent(10), incrementalEvent(11)];

    const cold = new ReplayPacker();
    const coldText = await blobText(cold.serialize(events));

    const warm = new ReplayPacker();
    warm.size(events); // warm the cache
    const warmText = await blobText(warm.serialize(events));

    expect(warmText).toBe(coldText);
  });

  it('handles an empty event list', async () => {
    const packer = new ReplayPacker();
    expect(await blobText(packer.serialize([]))).toBe('[]');
    expect(packer.size([])).toBe(2);
  });
});
