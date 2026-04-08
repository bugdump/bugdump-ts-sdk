import type { BugdumpConfig, BugdumpFeatures, BugdumpTranslations, CaptureMethod } from '../types';

const DEFAULT_ENDPOINT = 'https://api.bugdump.com';

const DEFAULT_FEATURES: Required<BugdumpFeatures> = {
  screenshot: true,
  screenshotMethod: 'dom' as CaptureMethod,
  screenRecording: true,
  screenRecordingMethod: 'dom' as CaptureMethod,
  sessionReplay: true,
  attachments: true,
};

export const DEFAULT_TRANSLATIONS: Required<BugdumpTranslations> = {
  title: 'Send feedback',
  descriptionPlaceholder: 'What\'s on your mind?',
  attachButton: 'Attach',
  screenshotButton: 'Screenshot',
  recordButton: 'Record',
  sendButton: 'Send',
  reporterToggle: 'Reporter info',
  namePlaceholder: 'Your name',
  emailPlaceholder: 'Your email',
  capturing: 'Capturing...',
  stop: 'Stop',
  sending: 'Sending...',
  successTitle: 'Feedback sent!',
  successSubtitle: 'Thank you for your feedback.',
  errorMessage: 'Something went wrong. Please try again.',
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
};

export function resolveConfig(config: BugdumpConfig): Required<BugdumpConfig> {
  return {
    apiKey: config.apiKey,
    endpoint: (config.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ''),
    captureNetworkBodies: config.captureNetworkBodies ?? false,
    hideButton: config.hideButton ?? false,
    showReportLink: config.showReportLink ?? false,
    theme: config.theme ?? 'auto',
    icon: config.icon ?? '',
    features: { ...DEFAULT_FEATURES, ...config.features },
    translations: { ...DEFAULT_TRANSLATIONS, ...config.translations },
  };
}
