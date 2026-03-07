import type { BugdumpConfig, BugdumpUserContext, WidgetConfig } from '../types';

export interface SdkState {
  initialized: boolean;
  config: Required<BugdumpConfig> | null;
  widgetConfig: WidgetConfig | null;
  user: BugdumpUserContext | null;
  customContext: Record<string, unknown>;
  widgetOpen: boolean;
}

export function createInitialState(): SdkState {
  return {
    initialized: false,
    config: null,
    widgetConfig: null,
    user: null,
    customContext: {},
    widgetOpen: false,
  };
}
