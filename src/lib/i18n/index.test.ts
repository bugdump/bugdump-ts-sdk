import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALES, detectLanguages, findLocale, resolveLocale } from './index';

describe('findLocale', () => {
  it('matches the base language of a tag, ignoring case and region', () => {
    expect(findLocale('pt-BR')).toBe('pt');
    expect(findLocale('EN_us')).toBe('en');
    expect(findLocale('fr')).toBe('fr');
  });

  it('returns undefined for languages that are not shipped', () => {
    expect(findLocale('de')).toBeUndefined();
    expect(findLocale('')).toBeUndefined();
    expect(findLocale('constructor')).toBeUndefined();
  });
});

describe('resolveLocale', () => {
  it('keeps an explicit tag as given, trimmed', () => {
    expect(resolveLocale('fr', ['ru'])).toBe('fr');
    expect(resolveLocale(' fr-CA ', ['ru'])).toBe('fr-CA');
    expect(resolveLocale('de', ['ru'])).toBe('de');
  });

  it('detects the language for auto in any case, an empty value or no value', () => {
    expect(resolveLocale('auto', ['ru'])).toBe('ru');
    expect(resolveLocale('AUTO', ['ru'])).toBe('ru');
    expect(resolveLocale('', ['ru'])).toBe('ru');
    expect(resolveLocale(undefined, ['ru'])).toBe('ru');
  });

  it('picks the first detected language that is shipped, else English', () => {
    expect(resolveLocale(undefined, ['', 'de-DE', 'es'])).toBe('es');
    expect(resolveLocale(undefined, [])).toBe('en');
    expect(resolveLocale(undefined, ['constructor'])).toBe('en');
  });
});

describe('detectLanguages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing outside a browser', () => {
    expect(detectLanguages()).toEqual([]);
  });

  it('lists the page language before the browser languages', () => {
    vi.stubGlobal('document', { documentElement: { lang: 'ru' } });
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'en'] });

    expect(detectLanguages()).toEqual(['ru', 'fr-FR', 'en']);
  });

  it('skips an empty page language', () => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    vi.stubGlobal('navigator', { languages: ['es-ES'] });

    expect(detectLanguages()).toEqual(['es-ES']);
  });
});

describe('language packs', () => {
  it('has no empty value and nothing the panel template would parse as markup', () => {
    for (const [locale, pack] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(pack)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
        expect(value, `${locale}.${key}`).not.toMatch(/[<>"&]/);
      }
    }
  });
});
