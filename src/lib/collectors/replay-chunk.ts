import { REPLAY_CHUNK, loadChunk } from '../core/chunk-loader';

export type ReplayChunk = {
  record: typeof import('@rrweb/record').record;
  pack: typeof import('@rrweb/packer').pack;
};

let loaded: ReplayChunk | null = null;

export async function loadReplayChunk(): Promise<ReplayChunk> {
  loaded ??= await loadChunk<ReplayChunk>(REPLAY_CHUNK);
  return loaded;
}

/**
 * The chunk, or null while it is still loading. Callers that only run once rrweb has
 * produced events can rely on it being non-null — nothing can have been recorded otherwise.
 */
export function replayChunk(): ReplayChunk | null {
  return loaded;
}
