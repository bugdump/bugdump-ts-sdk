import type { BugdumpLocale, BugdumpTranslations } from '../types';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { pt } from './pt';
import { ru } from './ru';

export const LOCALES: Record<BugdumpLocale, Required<BugdumpTranslations>> = { en, ru, es, fr, pt, de };
export const BUGDUMP_LOCALES = Object.keys(LOCALES) as BugdumpLocale[];

export function findLocale(tag: string): BugdumpLocale | undefined {
  const base = tag.toLowerCase().split(/[-_]/)[0];
  // A list lookup, not `base in LOCALES`, which would match prototype keys like 'constructor'.
  return BUGDUMP_LOCALES.find((locale) => locale === base);
}

export function resolveLocale(requested: string | undefined, detected: readonly string[]): string {
  const tag = requested?.trim() ?? '';
  if (tag && tag.toLowerCase() !== 'auto') return tag;
  for (const candidate of detected) {
    const match = findLocale(candidate);
    if (match) return match;
  }
  return 'en';
}

export function detectLanguages(): string[] {
  // Node 21+ has a global `navigator` that follows the machine's locale; without the
  // `document` check, tests would resolve differently on a Russian machine.
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return [];
  return [document.documentElement.lang, ...navigator.languages].filter(Boolean);
}
