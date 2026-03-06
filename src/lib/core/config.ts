import type { BugdumpConfig } from '../types';

const DEFAULT_ENDPOINT = 'https://api.bugdump.com';

export function resolveConfig(config: BugdumpConfig): Required<BugdumpConfig> {
  return {
    projectKey: config.projectKey,
    endpoint: (config.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ''),
  };
}
