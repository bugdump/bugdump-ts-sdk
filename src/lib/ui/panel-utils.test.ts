import { describe, expect, it } from 'vitest';
import { formatDuration, getThemeClass, parseTaskIdInput } from './panel-utils';

describe('parseTaskIdInput', () => {
  it('reads a bare number', () => {
    expect(parseTaskIdInput('42')).toBe(42);
    expect(parseTaskIdInput('  42  ')).toBe(42);
  });

  it('reads the number out of a label the reporter pasted', () => {
    expect(parseTaskIdInput('#42')).toBe(42);
    expect(parseTaskIdInput('BD-42')).toBe(42);
    expect(parseTaskIdInput('bd-42')).toBe(42);
  });

  // The whole point of matching the key rather than stripping non-digits: `WEB3-42` used to
  // yield 342 and attach the report to a task the reporter never named.
  it('ignores digits that belong to the project key, not the number', () => {
    expect(parseTaskIdInput('WEB3-42')).toBe(42);
    expect(parseTaskIdInput('A1B2-7')).toBe(7);
  });

  it('returns null rather than guessing at input that names no task', () => {
    for (const value of ['', '   ', 'abc', '0', 'BD-0', '007', 'BD-007', '4.2', '-1', '42-BD']) {
      expect(parseTaskIdInput(value)).toBeNull();
    }
  });
});

describe('formatDuration', () => {
  it('pads the seconds', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });
});

describe('getThemeClass', () => {
  it('maps dark and auto to their host classes', () => {
    expect(getThemeClass('dark')).toBe('bd-theme-dark');
    expect(getThemeClass('auto')).toBe('bd-theme-auto');
  });

  it('needs no class for the light base style', () => {
    expect(getThemeClass('light')).toBeNull();
    expect(getThemeClass(undefined)).toBeNull();
  });
});
