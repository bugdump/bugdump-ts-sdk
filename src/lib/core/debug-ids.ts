import { parseStackLocations } from './stack';

const MAX_DEBUG_IDS = 100;

// `_bugdumpDebugIds` is keyed by a stack captured inside each injected file; its first
// frame is that file's URL. The map from URL to ID is rebuilt only when the registry has
// gained keys, which happens as lazy chunks load.
let cachedRegistry: Record<string, string> | null = null;
let cachedKeyCount = 0;
let urlToDebugId = new Map<string, string>();

function readUrlToDebugId(): Map<string, string> {
  const registry = globalThis._bugdumpDebugIds;
  if (!registry) return new Map();

  const keys = Object.keys(registry);
  if (registry === cachedRegistry && keys.length === cachedKeyCount) return urlToDebugId;

  const next = new Map<string, string>();
  for (const key of keys) {
    const file = parseStackLocations(key)[0]?.file;
    const debugId = registry[key];
    if (file && typeof debugId === 'string') next.set(file, debugId);
  }
  cachedRegistry = registry;
  cachedKeyCount = keys.length;
  urlToDebugId = next;
  return next;
}

/** The debug IDs of the injected files an error's stack runs through, keyed by script URL. */
export function getDebugIdsForStack(stack: string | undefined, filename?: string): Record<string, string> {
  try {
    const result: Record<string, string> = {};
    let count = 0;
    for (const [url, debugId] of readUrlToDebugId()) {
      if (count === MAX_DEBUG_IDS) break;
      const inError = stack ? stack.includes(url) : url === filename;
      if (!inError) continue;
      result[url] = debugId;
      count++;
    }
    return result;
  } catch {
    return {};
  }
}
