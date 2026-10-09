import type { BugdumpConfig, BugdumpFeatures, BugdumpPosition, CaptureMethod } from '../types';
import { LOCALES, detectLanguages, findLocale, resolveLocale } from '../i18n';

type OptionalConfigKeys = 'consoleFilter' | 'networkFilter' | 'release' | 'ignoreErrors' | 'beforeSend';

export type ResolvedBugdumpConfig = Required<Omit<BugdumpConfig, OptionalConfigKeys | 'locale'>> &
  Pick<BugdumpConfig, OptionalConfigKeys> & { locale: string };

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

export function resolveConfig(config: BugdumpConfig): ResolvedBugdumpConfig {
  const locale = resolveLocale(config.locale, detectLanguages());
  const pack = LOCALES[findLocale(locale) ?? 'en'];

  return {
    apiKey: config.apiKey,
    endpoint: (config.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, ''),
    captureNetworkBodies: config.captureNetworkBodies ?? false,
    hideButton: config.hideButton ?? false,
    showReportLink: config.showReportLink ?? false,
    theme: config.theme ?? 'auto',
    position: config.position ?? 'bottom-right',
    locale,
    icon: config.icon ?? '',
    bubbleText: config.bubbleText ?? '',
    features: { ...DEFAULT_FEATURES, ...config.features },
    translations: {
      ...pack,
      ...config.translations,
      // A custom panel title doubles as the trigger tooltip unless overridden explicitly
      triggerTitle: config.translations?.triggerTitle ?? config.translations?.title ?? pack.triggerTitle,
    },
    consoleFilter: config.consoleFilter,
    networkFilter: config.networkFilter,
    captureErrors: config.captureErrors ?? true,
    release: config.release || undefined,
    sampleRate: resolveSampleRate(config.sampleRate),
    ignoreErrors: config.ignoreErrors,
    beforeSend: config.beforeSend,
  };
}

function resolveSampleRate(sampleRate: number | undefined): number {
  if (sampleRate === undefined) return 1;
  if (Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate <= 1) {
    return sampleRate;
  }
  console.warn(`[Bugdump] sampleRate must be a number from 0 to 1, got ${String(sampleRate)}; sending every error.`);
  return 1;
}
