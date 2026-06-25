import type { UserAction } from '../types';

const MAX_ENTRIES = 500;
const MAX_ENTRIES_RECORDING = 3000;
const INPUT_DEBOUNCE_MS = 400;
const MAX_VALUE_LEN = 80;

const SENSITIVE_AUTOCOMPLETE = [
  'current-password',
  'new-password',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'one-time-code',
];

const WIDGET_HOST_TAG = 'bugdump-widget';

type HistoryMethod = 'pushState' | 'replaceState';
const HISTORY_METHODS: HistoryMethod[] = ['pushState', 'replaceState'];

/**
 * Records real user interactions (clicks, typing, toggles, selections, submits,
 * navigations) by listening to DOM events directly, rather than reverse-engineering
 * intent from rrweb's value-mutation stream. Buffers semantic actions with absolute
 * epoch timestamps so they align with the replay playhead, and can be sliced to a
 * time window for an attached recording. Sensitive field values are masked.
 */
export class ActionCollector {
  private buffer: UserAction[] = [];
  private active = false;
  private elevated = false;
  private pendingInput = new Map<EventTarget, ReturnType<typeof setTimeout>>();
  private originalHistory = new Map<HistoryMethod, History[HistoryMethod]>();

  private readonly onClick = (event: Event) => this.handleClick(event);
  private readonly onInput = (event: Event) => this.handleInput(event);
  private readonly onChange = (event: Event) => this.handleChange(event);
  private readonly onSubmit = (event: Event) => this.handleSubmit(event);
  private readonly onPopState = () => this.handleNavigate();

  setRecording(recording: boolean): void {
    if (recording) this.elevated = true;
  }

  private get maxEntries(): number {
    return this.elevated ? MAX_ENTRIES_RECORDING : MAX_ENTRIES;
  }

  start(): void {
    if (this.active || typeof document === 'undefined') return;
    this.active = true;

    document.addEventListener('click', this.onClick, true);
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('change', this.onChange, true);
    document.addEventListener('submit', this.onSubmit, true);
    window.addEventListener('popstate', this.onPopState);
    this.patchHistory();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;

    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('change', this.onChange, true);
    document.removeEventListener('submit', this.onSubmit, true);
    window.removeEventListener('popstate', this.onPopState);
    this.unpatchHistory();

    for (const timer of this.pendingInput.values()) clearTimeout(timer);
    this.pendingInput.clear();
  }

  snapshot(): UserAction[] {
    this.flushPendingInputs();
    return [...this.buffer];
  }

  getActionsInWindow(startTs: number, endTs: number): UserAction[] {
    this.flushPendingInputs();
    return this.buffer.filter((a) => a.ts >= startTs && a.ts <= endTs);
  }

  getRecentActions(windowMs: number): UserAction[] {
    this.flushPendingInputs();
    const cutoff = Date.now() - windowMs;
    return this.buffer.filter((a) => a.ts >= cutoff);
  }

  flush(): UserAction[] {
    this.flushPendingInputs();
    const entries = [...this.buffer];
    this.buffer = [];
    this.elevated = false;
    return entries;
  }

  private patchHistory(): void {
    for (const method of HISTORY_METHODS) {
      const original = history[method].bind(history) as History[HistoryMethod];
      this.originalHistory.set(method, original);
      history[method] = ((data: unknown, unused: string, url?: string | URL | null) => {
        original(data, unused, url ?? undefined);
        this.handleNavigate();
      }) as History[HistoryMethod];
    }
  }

  private unpatchHistory(): void {
    for (const method of HISTORY_METHODS) {
      const original = this.originalHistory.get(method);
      if (original) history[method] = original;
    }
    this.originalHistory.clear();
  }

  private handleClick(event: Event): void {
    if (isFromWidget(event)) return;
    const el = event.target;
    if (!(el instanceof Element)) return;
    this.push({ kind: 'click', ts: Date.now(), selector: describeElement(el) });
  }

  private handleInput(event: Event): void {
    if (isFromWidget(event)) return;
    const el = event.target;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return;

    // Debounce per element so filling a field yields one action with its final value.
    const existing = this.pendingInput.get(el);
    if (existing) clearTimeout(existing);
    this.pendingInput.set(
      el,
      setTimeout(() => this.commitInput(el), INPUT_DEBOUNCE_MS),
    );
  }

  private commitInput(el: HTMLInputElement | HTMLTextAreaElement): void {
    this.pendingInput.delete(el);
    const action: UserAction = { kind: 'type', ts: Date.now(), selector: describeElement(el) };
    if (isSensitive(el)) {
      action.masked = true;
    } else if (el.value) {
      action.value = truncate(el.value);
    }
    this.push(action);
  }

  private handleChange(event: Event): void {
    if (isFromWidget(event)) return;
    const el = event.target;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      this.push({ kind: 'toggle', ts: Date.now(), selector: describeElement(el), checked: el.checked });
      return;
    }
    if (el instanceof HTMLSelectElement) {
      const action: UserAction = { kind: 'select', ts: Date.now(), selector: describeElement(el) };
      if (isSensitive(el)) {
        action.masked = true;
      } else {
        const label = el.options[el.selectedIndex]?.text ?? el.value;
        if (label) action.value = truncate(label);
      }
      this.push(action);
    }
  }

  private handleSubmit(event: Event): void {
    if (isFromWidget(event)) return;
    const el = event.target;
    if (!(el instanceof Element)) return;
    this.push({ kind: 'submit', ts: Date.now(), selector: describeElement(el) });
  }

  private handleNavigate(): void {
    this.push({ kind: 'navigate', ts: Date.now(), url: location.href });
  }

  private flushPendingInputs(): void {
    for (const [el, timer] of this.pendingInput) {
      clearTimeout(timer);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        this.commitInput(el);
      }
    }
    this.pendingInput.clear();
  }

  private push(action: UserAction): void {
    this.buffer.push(action);
    const cap = this.maxEntries;
    if (this.buffer.length > cap) {
      this.buffer.splice(0, this.buffer.length - cap);
    }
  }
}

function isFromWidget(event: Event): boolean {
  // The widget host has a closed shadow root, so any event originating inside it
  // retargets to the host — `event.target` is the `<bugdump-widget>` host element.
  // This is necessary and sufficient: there is no widget-internal event whose target
  // is not the host. An O(1) check, no composed-path allocation per event.
  const target = event.target;
  return target instanceof Element && target.tagName.toLowerCase() === WIDGET_HOST_TAG;
}

function truncate(value: string): string {
  return value.length > MAX_VALUE_LEN ? `${value.slice(0, MAX_VALUE_LEN)}…` : value;
}

function isSensitive(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  if (el.closest('.bugdump-block, [data-bugdump-mask]')) return true;
  const autocomplete = el.getAttribute('autocomplete');
  if (autocomplete && SENSITIVE_AUTOCOMPLETE.includes(autocomplete.toLowerCase())) return true;
  return false;
}

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parts: string[] = [tag];

  if (el.id) {
    const id = el.id.length > 24 ? `${el.id.slice(0, 24)}…` : el.id;
    parts.push(`id="${id}"`);
  }

  const type = el.getAttribute('type');
  if (type) parts.push(`type="${type}"`);

  return `<${parts.join(' ')}>`;
}
