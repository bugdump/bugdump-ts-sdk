export interface ConsoleLogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
  timestamp: number;
}

const MAX_ENTRIES = 50;

type ConsoleMethod = 'log' | 'warn' | 'error' | 'info' | 'debug';
const METHODS: ConsoleMethod[] = ['log', 'warn', 'error', 'info', 'debug'];

export class ConsoleCollector {
  private buffer: ConsoleLogEntry[] = [];
  private originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();
  private active = false;

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

  flush(): ConsoleLogEntry[] {
    const entries = [...this.buffer];
    this.buffer = [];
    return entries;
  }

  private push(entry: ConsoleLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer.shift();
    }
  }

  private serializeArgs(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (arg === null || arg === undefined) return arg;
      if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;

      try {
        return JSON.parse(JSON.stringify(arg, this.circularReplacer()));
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
