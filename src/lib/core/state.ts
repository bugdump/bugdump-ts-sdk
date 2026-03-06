import type { BugdumpConfig, BugdumpUserContext } from '../types';

export interface SdkState {
  initialized: boolean;
  config: Required<BugdumpConfig> | null;
  user: BugdumpUserContext | null;
  customContext: Record<string, unknown>;
  widgetOpen: boolean;
}

export function createInitialState(): SdkState {
  return {
    initialized: false,
    config: null,
    user: null,
    customContext: {},
    widgetOpen: false,
  };
}
