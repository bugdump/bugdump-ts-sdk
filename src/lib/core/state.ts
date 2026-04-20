import type { BugdumpUserContext, WidgetConfig } from '../types';
import type { ResolvedBugdumpConfig } from './config';

export interface SdkState {
  initialized: boolean;
  config: ResolvedBugdumpConfig | null;
  widgetConfig: WidgetConfig | null;
  user: BugdumpUserContext | null;
  customContext: Record<string, unknown>;
  widgetOpen: boolean;
  activeTaskId: number | null;
}

export function createInitialState(): SdkState {
  return {
    initialized: false,
    config: null,
    widgetConfig: null,
    user: null,
    customContext: {},
    widgetOpen: false,
    activeTaskId: null,
  };
}
