/**
 * Loads the SDK's optional heavy dependencies on demand.
 *
 * Two very different consumers, so two strategies, picked at build time by the
 * `__BUGDUMP_IIFE__` define:
 *
 * - **Script tag (IIFE build).** There is no bundler at runtime, so the chunk is fetched by
 *   URL. The specifier has to stay a *runtime* value — esbuild resolves a literal
 *   `import('./chunk')` at build time and folds the module straight back into the entry,
 *   which would defeat the whole point.
 * - **npm (ESM/CJS builds).** The consumer's own bundler owns code splitting, so a bare
 *   specifier is correct; it produces a chunk in *their* output. A URL would be
 *   unresolvable there.
 *
 * Both branches are statements rather than expressions on purpose: esbuild drops the whole
 * dead `if`/`else` arm once the define is substituted, which is what keeps each build free
 * of the other's imports.
 */

export const HTML2CANVAS_CHUNK = 'bugdump-html2canvas.js';
export const REPLAY_CHUNK = 'bugdump-replay.js';

/** The script's own URL, used to resolve sibling chunks served next to it. */
const scriptBaseUrl = (() => {
  if (typeof document === 'undefined') return '';
  // Only valid during the script's initial synchronous run, so it is read once, here —
  // reading it later (inside a click handler, say) always yields null.
  const current = document.currentScript as HTMLScriptElement | null;
  if (current?.src) return current.src;
  const tagged = document.querySelectorAll<HTMLScriptElement>('script[data-api-key]');
  return tagged[tagged.length - 1]?.src ?? '';
})();

function importBundled(fileName: string): Promise<unknown> {
  switch (fileName) {
    case HTML2CANVAS_CHUNK:
      return import('../../chunks/html2canvas');
    case REPLAY_CHUNK:
      return import('../../chunks/replay');
    default:
      return Promise.reject(new Error(`Bugdump: unknown chunk "${fileName}".`));
  }
}

const inFlight = new Map<string, Promise<unknown>>();

export function loadChunk<T>(fileName: string): Promise<T> {
  let pending = inFlight.get(fileName);

  if (!pending) {
    if (__BUGDUMP_IIFE__) {
      pending = import(new URL(`./${fileName}`, scriptBaseUrl).href);
    } else {
      pending = importBundled(fileName);
    }
    // A failed chunk load must not stay cached, or one flaky request leaves the feature
    // broken for the rest of the session.
    pending = pending.catch((error: unknown) => {
      inFlight.delete(fileName);
      throw error;
    });
    inFlight.set(fileName, pending);
  }

  return pending as Promise<T>;
}
