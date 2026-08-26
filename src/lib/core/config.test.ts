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
});
