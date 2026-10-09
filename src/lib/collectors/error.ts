import type { BugdumpErrorEvent } from '../types';
import { BugdumpApiError } from '../http-client';
import { parseStackLocations, type StackLocation } from '../core/stack';

export type CapturedErrorDetails = BugdumpErrorEvent['error'];

export interface ErrorCollectorOptions {
  sampleRate: number;
  ignoreErrors?: Array<string | RegExp>;
  /** URLs of the SDK's own scripts, matched exactly against stack frames. Empty in the npm build. */
  sdkFiles: string[];
  onCapture: (error: CapturedErrorDetails, context?: Record<string, unknown>) => void;
}

const SENT_ERRORS_STORAGE_KEY = 'bugdump:sent-errors';
const MAX_SENT_ERROR_KEYS = 100;
const MAX_ERRORS_PER_MINUTE = 10;
const MINUTE_MS = 60_000;
const MAX_REJECTION_VALUE_LENGTH = 500;

const EXTENSION_SCHEMES = ['chrome-extension:', 'moz-extension:', 'safari-extension:', 'safari-web-extension:'];
const RESIZE_OBSERVER_MESSAGES = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
];

export class ErrorCollector {
  private active = false;
  private halted = false;
  private sentKeys: string[] | null = null;
  private sendTimes: number[] = [];
  private readonly sdkFiles: Set<string>;

  private readonly onError = (event: Event) => this.handleError(event);
  private readonly onRejection = (event: PromiseRejectionEvent) => this.handleRejection(event);

  constructor(private readonly options: ErrorCollectorOptions) {
    this.sdkFiles = new Set(options.sdkFiles);
  }

  start(): void {
    if (this.active || this.halted) return;
    this.active = true;
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onRejection);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onRejection);
  }

  /** Stops every capture for the rest of the page, `captureException` included. */
  halt(): void {
    this.halted = true;
    this.stop();
  }

  /** Sends a handled error. Never sampled, but subject to the session, per-minute and stop rules. */
  captureException(value: unknown, context?: Record<string, unknown>): void {
    const details = describeThrown(value, 'manual', true);
    this.send(details, parseFrames(details), context);
  }

  private handleError(event: Event): void {
    // Resource load failures reach `error` listeners as plain Events.
    if (!(event instanceof ErrorEvent)) return;

    const thrown: unknown = event.error;
    const details = describeThrown(thrown, 'onerror', false);
    // Cross-origin script errors and some browser errors carry no error object, only the message.
    if (thrown === null || thrown === undefined) details.message = event.message;
    if (event.filename) details.filename = event.filename;
    if (event.lineno) details.lineno = event.lineno;
    if (event.colno) details.colno = event.colno;

    this.captureAutomatically(details, thrown);
  }

  private handleRejection(event: PromiseRejectionEvent): void {
    const reason: unknown = event.reason;
    this.captureAutomatically(describeThrown(reason, 'unhandledrejection', false), reason);
  }

  private captureAutomatically(details: CapturedErrorDetails, thrown: unknown): void {
    const frames = parseFrames(details);
    if (this.isOwnError(details, thrown, frames)) return;
    if (isIgnoredByDefault(details, frames)) return;
    if (this.isIgnoredByUser(details)) return;
    if (!(Math.random() < this.options.sampleRate)) return;
    this.send(details, frames);
  }

  private send(details: CapturedErrorDetails, frames: StackLocation[], context?: Record<string, unknown>): void {
    if (this.halted) return;

    const first = frames[0];
    const key = hashKey(
      `${details.type}\n${details.message}\n${first ? `${first.file}:${first.line}:${first.column}` : ''}`,
    );
    if (this.wasSentThisSession(key)) return;

    const now = Date.now();
    this.sendTimes = this.sendTimes.filter((time) => now - time < MINUTE_MS);
    if (this.sendTimes.length >= MAX_ERRORS_PER_MINUTE) return;

    this.markSentThisSession(key);
    this.sendTimes.push(now);
    this.options.onCapture(details, context);
  }

  private isOwnError(details: CapturedErrorDetails, thrown: unknown, frames: StackLocation[]): boolean {
    if (thrown instanceof BugdumpApiError || details.message.startsWith('[Bugdump]')) return true;
    return frames.length > 0 && frames.every((frame) => this.sdkFiles.has(frame.file));
  }

  private isIgnoredByUser(details: CapturedErrorDetails): boolean {
    const patterns = this.options.ignoreErrors;
    if (!patterns?.length) return false;
    const text = `${details.type}: ${details.message}`;
    return patterns.some((pattern) => (typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)));
  }

  private wasSentThisSession(key: string): boolean {
    return this.loadSentKeys().includes(key);
  }

  private markSentThisSession(key: string): void {
    const keys = this.loadSentKeys();
    keys.push(key);
    if (keys.length > MAX_SENT_ERROR_KEYS) keys.splice(0, keys.length - MAX_SENT_ERROR_KEYS);
    try {
      sessionStorage.setItem(SENT_ERRORS_STORAGE_KEY, JSON.stringify(keys));
    } catch {
      // Storage can be full or blocked; the in-memory list still dedupes for this page.
    }
  }

  private loadSentKeys(): string[] {
    if (this.sentKeys) return this.sentKeys;
    let stored: unknown = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(SENT_ERRORS_STORAGE_KEY) ?? 'null');
    } catch {
      // Unreadable or blocked storage starts an empty list.
    }
    this.sentKeys = Array.isArray(stored)
      ? stored.filter((key): key is string => typeof key === 'string').slice(-MAX_SENT_ERROR_KEYS)
      : [];
    return this.sentKeys;
  }
}

function describeThrown(
  value: unknown,
  mechanism: CapturedErrorDetails['mechanism'],
  handled: boolean,
): CapturedErrorDetails {
  if (value instanceof Error) {
    return {
      type: typeof value.name === 'string' && value.name ? value.name : 'Error',
      message: stringifyValue(value.message),
      stack: typeof value.stack === 'string' ? value.stack : undefined,
      mechanism,
      handled,
    };
  }
  if (mechanism === 'unhandledrejection') {
    return {
      type: 'UnhandledRejection',
      message: stringifyValue(value).slice(0, MAX_REJECTION_VALUE_LENGTH),
      mechanism,
      handled,
    };
  }
  return { type: 'Error', message: stringifyValue(value), mechanism, handled };
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    // Circular values and throwing toJSON fall through to String().
  }
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function parseFrames(details: CapturedErrorDetails): StackLocation[] {
  const frames = details.stack ? parseStackLocations(details.stack) : [];
  if (frames.length === 0 && details.filename) {
    return [{ file: details.filename, line: details.lineno ?? 0, column: details.colno ?? 0 }];
  }
  return frames;
}

function isIgnoredByDefault(details: CapturedErrorDetails, frames: StackLocation[]): boolean {
  if (/^Script error\.?$/.test(details.message) && !details.filename && !details.lineno) return true;
  if (frames.some((frame) => EXTENSION_SCHEMES.some((scheme) => frame.file.startsWith(scheme)))) return true;
  return RESIZE_OBSERVER_MESSAGES.some((message) => details.message.includes(message));
}

/** FNV-1a: a short, stable session key, so 100 of them stay small in `sessionStorage`. */
function hashKey(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
