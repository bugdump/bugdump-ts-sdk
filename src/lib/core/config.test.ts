import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config';

describe('resolveConfig', () => {
  it('applies the default features, including native-first capture methods', () => {
    const resolved = resolveConfig({ apiKey: 'bd_test' });

    // These defaults are load-bearing for the bundle: 'screen-capture' means html2canvas is
    // only ever fetched through the DOM fallback, never on the happy path.
    expect(resolved.features.screenshotMethod).toBe('screen-capture');
    expect(resolved.features.screenRecordingMethod).toBe('screen-capture');
    expect(resolved.features.sessionReplay).toBe(true);
    expect(resolved.features.screenshot).toBe(true);
    expect(resolved.features.attachments).toBe(true);
    expect(resolved.features.allowTaskAttach).toBe(false);
  });

  it('merges explicit features over the defaults without dropping the rest', () => {
    const resolved = resolveConfig({ apiKey: 'bd_test', features: { sessionReplay: false, screenshotMethod: 'dom' } });

    expect(resolved.features.sessionReplay).toBe(false);
    expect(resolved.features.screenshotMethod).toBe('dom');
    expect(resolved.features.screenRecording).toBe(true);
  });

  it('strips trailing slashes from the endpoint and falls back to the default', () => {
    expect(resolveConfig({ apiKey: 'k', endpoint: 'https://api.example.com///' }).endpoint).toBe(
      'https://api.example.com',
    );
    expect(resolveConfig({ apiKey: 'k' }).endpoint).toBe('https://api.bugdump.com');
  });

  it('defaults the position to the bottom-right corner and passes an explicit side through', () => {
    expect(resolveConfig({ apiKey: 'k' }).position).toBe('bottom-right');
    expect(resolveConfig({ apiKey: 'k', position: 'bottom-left' }).position).toBe('bottom-left');
  });

  it('reuses a custom panel title as the trigger tooltip unless overridden', () => {
    expect(resolveConfig({ apiKey: 'k', translations: { title: 'Report it' } }).translations.triggerTitle).toBe(
      'Report it',
    );
    expect(
      resolveConfig({ apiKey: 'k', translations: { title: 'Report it', triggerTitle: 'Click me' } }).translations
        .triggerTitle,
    ).toBe('Click me');
    expect(resolveConfig({ apiKey: 'k' }).translations.triggerTitle).toBe('Send feedback');
  });

  it('uses the pack of an explicit locale and declares it', () => {
    const resolved = resolveConfig({ apiKey: 'k', locale: 'fr' });

    expect(resolved.locale).toBe('fr');
    expect(resolved.translations.title).toBe('Envoyer un retour');
    expect(resolved.translations.triggerTitle).toBe('Envoyer un retour');
  });

  it('falls back to English strings for a locale that is not shipped, but still declares it', () => {
    const resolved = resolveConfig({ apiKey: 'k', locale: 'it' });

    expect(resolved.locale).toBe('it');
    expect(resolved.translations.sendButton).toBe('Send');
  });

  it('applies translation overrides on top of the locale pack', () => {
    const resolved = resolveConfig({ apiKey: 'k', locale: 'ru', translations: { title: 'Сообщить об ошибке' } });

    expect(resolved.translations.title).toBe('Сообщить об ошибке');
    expect(resolved.translations.sendButton).toBe('Отправить');
  });

  it('declares English when nothing is detected', () => {
    expect(resolveConfig({ apiKey: 'k' }).locale).toBe('en');
  });
});
