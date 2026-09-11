import type { BugdumpTheme } from '../types';

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function getThemeClass(theme: BugdumpTheme | undefined): 'bd-theme-dark' | 'bd-theme-auto' | null {
  if (theme === 'dark') return 'bd-theme-dark';
  if (theme === 'auto') return 'bd-theme-auto';
  return null;
}

export function getSupportedMimeType(): string {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}

const CONTAINED_EVENTS = ['keydown', 'keypress', 'keyup', 'paste'] as const;

/**
 * Keyboard and paste events are composed: they cross the shadow boundary and reach the host
 * page retargeted to the widget host, so a host-page "type anywhere" handler reads typing in
 * our own textarea as typing with nothing focused and steals the keystroke. Stop them at the
 * shadow root — the host page has no business seeing what a user types into the widget.
 * Capture-phase listeners on the host page still run; nothing inside a shadow tree can prevent that.
 */
export function containKeyboardEvents(root: ShadowRoot): void {
  for (const type of CONTAINED_EVENTS) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }
}

// `42`, `#42` and `BD-42` all name task 42. Taking every digit instead would fold a digit inside
// the project key into the number — `WEB3-42` would attach the report to task 342 — so the key,
// whatever it is, has to be matched and dropped rather than stripped character by character.
const TASK_ID_INPUT_PATTERN = /^(?:#|[A-Za-z][A-Za-z0-9]{1,9}-)?([1-9]\d{0,8})$/;

/** The task number a reporter typed, or null when what they typed does not name a task. */
export function parseTaskIdInput(raw: string): number | null {
  const match = TASK_ID_INPUT_PATTERN.exec(raw.trim());
  return match ? Number(match[1]) : null;
}
