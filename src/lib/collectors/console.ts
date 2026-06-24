import type { ConsoleFilterOptions } from '../types';

export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
  timestamp: number;
}

export interface ConsoleCollectorOptions {
  filter?: ConsoleFilterOptions;
}

const MAX_ENTRIES = 300;
const MAX_ENTRIES_RECORDING = 2000;
const MAX_ARG_SIZE = 8192;

type ConsoleMethod = 'log' | 'warn' | 'error' | 'info' | 'debug';
const METHODS: ConsoleMethod[] = ['log', 'warn', 'error', 'info', 'debug'];

export class ConsoleCollector {
  private buffer: ConsoleLogEntry[] = [];
  private originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();
  private active = false;
  private elevated = false;
  private options: ConsoleCollectorOptions;

  constructor(options: ConsoleCollectorOptions = {}) {
    this.options = options;
  }

  setRecording(recording: boolean): void {
    // Raise the cap while recording and keep it raised until flush() — entries captured
    // during the recording must survive past the Stop click, until the report is sent.
    if (recording) this.elevated = true;
  }

  private get maxEntries(): number {
    return this.elevated ? MAX_ENTRIES_RECORDING : MAX_ENTRIES;
  }

  start(): void {
    if (this.active) return;
    this.active = true;

    for (const method of METHODS) {
      this.originals.set(method, console[method].bind(console));

      console[method] = (...args: unknown[]) => {
        this.push({ level: method, args: this.serializeArgs(args), timestamp: Date.now() });
        this.originals.get(method)!(...args);
      };
    }
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;

    for (const method of METHODS) {
      const original = this.originals.get(method);
      if (original) {
        console[method] = original;
      }
    }
    this.originals.clear();
  }

  snapshot(): ConsoleLogEntry[] {
    return [...this.buffer];
  }

  flush(): ConsoleLogEntry[] {
    const entries = [...this.buffer];
    this.buffer = [];
    this.elevated = false;
    return entries;
  }

  private push(entry: ConsoleLogEntry): void {
    if (!this.shouldKeep(entry)) return;
    this.buffer.push(entry);
    this.trimToCap();
  }

  private trimToCap(): void {
    const cap = this.maxEntries;
    if (this.buffer.length > cap) {
      this.buffer.splice(0, this.buffer.length - cap);
    }
  }

  private shouldKeep(entry: ConsoleLogEntry): boolean {
    const filter = this.options.filter;
    if (!filter) return true;

    if (filter.levels && !filter.levels.includes(entry.level)) return false;

    if (filter.exclude && filter.exclude.length > 0) {
      const target = entry.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      for (const pattern of filter.exclude) {
        if (typeof pattern === 'string' ? target.includes(pattern) : pattern.test(target)) {
          return false;
        }
      }
    }

    if (filter.filter && !filter.filter(entry)) return false;

    return true;
  }

  private serializeArgs(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (arg === null || arg === undefined) return arg;
      if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;

      if (arg instanceof Error) {
        return { name: arg.name, message: arg.message, stack: arg.stack };
      }

      try {
        const serialized = JSON.stringify(arg, this.circularReplacer());
        if (serialized.length > MAX_ARG_SIZE) {
          return serialized.slice(0, MAX_ARG_SIZE) + '…[truncated]';
        }
        return JSON.parse(serialized);
      } catch {
        return String(arg);
      }
    });
  }

  private circularReplacer(): (key: string, value: unknown) => unknown {
    const seen = new WeakSet();
    return (_key: string, value: unknown) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    };
  }
}
