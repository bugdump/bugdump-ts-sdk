import type { BugdumpConfig, BugdumpFeatures, BugdumpPosition, BugdumpTranslations, CaptureMethod } from '../types';

export type ResolvedBugdumpConfig = Required<Omit<BugdumpConfig, 'consoleFilter' | 'networkFilter'>> &
  Pick<BugdumpConfig, 'consoleFilter' | 'networkFilter'>;

const DEFAULT_ENDPOINT = 'https://api.bugdump.com';

export const BUGDUMP_POSITIONS: readonly BugdumpPosition[] = ['bottom-right', 'bottom-left'];

const DEFAULT_FEATURES: Required<BugdumpFeatures> = {
  screenshot: true,
  screenshotMethod: 'screen-capture' as CaptureMethod,
  screenRecording: true,
  screenRecordingMethod: 'screen-capture' as CaptureMethod,
  sessionReplay: true,
  attachments: true,
  allowTaskAttach: false,
};

export const DEFAULT_TRANSLATIONS: Required<BugdumpTranslations> = {
  title: 'Send feedback',
  triggerTitle: 'Send feedback',
  descriptionPlaceholder: "What's on your mind?",
  attachButton: 'Attach',
  screenshotButton: 'Screenshot',
  recordButton: 'Record',
  startRecording: 'Record',
  sendButton: 'Send',
  reporterToggle: 'Reporter info',
  namePlaceholder: 'Your name',
  emailPlaceholder: 'Your email',
  taskAttachToggle: 'Attach to task',
  taskIdPlaceholder: 'Task ID',
  capturing: 'Capturing...',
  stop: 'Stop',
  sending: 'Sending...',
  successTitle: 'Feedback sent!',
  successSubtitle: 'Thank you for your feedback.',
  errorMessage: 'Something went wrong. Please try again.',
  emptyDescriptionMessage: 'Please describe what happened before sending.',
  arrowTool: 'Arrow',
  rectangleTool: 'Rectangle',
  drawTool: 'Draw',
  textTool: 'Text',
  blurTool: 'Blur',
  undo: 'Undo',
  cancel: 'Cancel',
  done: 'Done',
  badgeScreenshot: 'Screenshot',
  badgeRecording: 'Recording',
  badgeReplay: 'Replay',
  badgeVoiceNote: 'Voice note',
  copyLink: 'Copy link',
  copied: 'Copied!',
  closeButton: 'Close',
  submitAnother: 'Submit another',
};

export function resolveConfig(config: BugdumpConfig): ResolvedBugdumpConfig {
  return {
    apiKey: config.apiKey,
    endpoint: (config.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ''),
    captureNetworkBodies: config.captureNetworkBodies ?? false,
    hideButton: config.hideButton ?? false,
    showReportLink: config.showReportLink ?? false,
    theme: config.theme ?? 'auto',
    position: config.position ?? 'bottom-right',
    icon: config.icon ?? '',
    bubbleText: config.bubbleText ?? '',
    features: { ...DEFAULT_FEATURES, ...config.features },
    translations: {
      ...DEFAULT_TRANSLATIONS,
      ...config.translations,
      // A custom panel title doubles as the trigger tooltip unless overridden explicitly
      triggerTitle:
        config.translations?.triggerTitle ?? config.translations?.title ?? DEFAULT_TRANSLATIONS.triggerTitle,
    },
    consoleFilter: config.consoleFilter,
    networkFilter: config.networkFilter,
  };
}
