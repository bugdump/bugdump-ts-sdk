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
