/** Build-time flag: true only in the IIFE (script tag) build. See lib/core/chunk-loader.ts. */
declare const __BUGDUMP_IIFE__: boolean;

/** Filled by the snippet `bugdump sourcemaps inject` adds to each built file. See lib/core/debug-ids.ts. */
declare var _bugdumpDebugIds: Record<string, string> | undefined;
