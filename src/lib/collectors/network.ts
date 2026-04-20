import type { NetworkFilterOptions } from '../types';

export interface NetworkRequestEntry {
  method: string;
  url: string;
  status: number | null;
  statusText: string | null;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  duration: number | null;
  startedAt: number;
  error: string | null;
}

export interface NetworkCollectorOptions {
  captureBodies?: boolean;
  filter?: NetworkFilterOptions;
}

const MAX_ENTRIES = 30;
const MAX_BODY_SIZE = 32_768;

export class NetworkCollector {
  private buffer: NetworkRequestEntry[] = [];
  private originalFetch: typeof fetch | null = null;
  private originalXhrOpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
  private active = false;
  private options: NetworkCollectorOptions;

  constructor(options: NetworkCollectorOptions = {}) {
    this.options = options;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.patchFetch();
    this.patchXhr();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.restoreFetch();
    this.restoreXhr();
  }

  snapshot(): NetworkRequestEntry[] {
    return [...this.buffer];
  }

  flush(): NetworkRequestEntry[] {
    const entries = [...this.buffer];
    this.buffer = [];
    return entries;
  }

  private push(entry: NetworkRequestEntry): void {
    if (!this.shouldKeep(entry)) return;
    this.buffer.push(entry);
    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer.shift();
    }
  }

  private shouldKeep(entry: NetworkRequestEntry): boolean {
    const filter = this.options.filter;
    if (!filter) return true;

    if (filter.excludeMethods && filter.excludeMethods.includes(entry.method)) return false;

    if (filter.includeUrls && filter.includeUrls.length > 0) {
      const matches = filter.includeUrls.some((p) =>
        typeof p === 'string' ? entry.url.includes(p) : p.test(entry.url),
      );
      if (!matches) return false;
    }

    if (filter.excludeUrls && filter.excludeUrls.length > 0) {
      for (const pattern of filter.excludeUrls) {
        if (typeof pattern === 'string' ? entry.url.includes(pattern) : pattern.test(entry.url)) {
          return false;
        }
      }
    }

    if (filter.filter && !filter.filter(entry)) return false;

    return true;
  }

  private patchFetch(): void {
    this.originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const method = init?.method?.toUpperCase() || 'GET';
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const startedAt = Date.now();
      const requestHeaders = self.extractHeaders(init?.headers);
      const requestBody = self.options.captureBodies ? self.serializeBody(init?.body) : null;

      try {
        const response = await self.originalFetch!.call(window, input, init);
        let responseBody: string | null = null;

        if (self.options.captureBodies) {
          try {
            const cloned = response.clone();
            const text = await cloned.text();
            responseBody = self.truncateBody(text);
          } catch {
            // ignore - body may not be readable
          }
        }

        self.push({
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          requestHeaders,
          responseHeaders: self.extractHeaders(response.headers),
          requestBody,
          responseBody,
          duration: Date.now() - startedAt,
          startedAt,
          error: null,
        });
        return response;
      } catch (err) {
        self.push({
          method,
          url,
          status: null,
          statusText: null,
          requestHeaders,
          responseHeaders: {},
          requestBody,
          responseBody: null,
          duration: Date.now() - startedAt,
          startedAt,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    };
  }

  private restoreFetch(): void {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }
  }

  private patchXhr(): void {
    this.originalXhrOpen = XMLHttpRequest.prototype.open;
    this.originalXhrSend = XMLHttpRequest.prototype.send;
    const self = this;

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest & { __bd_method?: string; __bd_url?: string },
      method: string,
      url: string | URL,
    ) {
      this.__bd_method = method.toUpperCase();
      this.__bd_url = typeof url === 'string' ? url : url.href;
      return self.originalXhrOpen!.apply(this, arguments as unknown as Parameters<typeof XMLHttpRequest.prototype.open>);
    };

    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest & { __bd_method?: string; __bd_url?: string },
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      const startedAt = Date.now();
      const method = this.__bd_method || 'GET';
      const url = this.__bd_url || '';
      const requestBody = self.options.captureBodies ? self.serializeBody(body) : null;

      const onDone = () => {
        let responseBody: string | null = null;
        if (self.options.captureBodies) {
          try {
            responseBody = self.truncateBody(this.responseText);
          } catch {
            // ignore - responseText may not be available for non-text responses
          }
        }

        self.push({
          method,
          url,
          status: this.status || null,
          statusText: this.statusText || null,
          requestHeaders: {},
          responseHeaders: self.parseXhrResponseHeaders(this.getAllResponseHeaders()),
          requestBody,
          responseBody,
          duration: Date.now() - startedAt,
          startedAt,
          error: this.status === 0 ? 'Network error' : null,
        });
        this.removeEventListener('loadend', onDone);
      };

      this.addEventListener('loadend', onDone);
      return self.originalXhrSend!.call(this, body);
    };
  }

  private restoreXhr(): void {
    if (this.originalXhrOpen) {
      XMLHttpRequest.prototype.open = this.originalXhrOpen;
      this.originalXhrOpen = null;
    }
    if (this.originalXhrSend) {
      XMLHttpRequest.prototype.send = this.originalXhrSend;
      this.originalXhrSend = null;
    }
  }

  private extractHeaders(headers?: HeadersInit | Headers): Record<string, string> {
    const result: Record<string, string> = {};
    if (!headers) return result;

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        result[key] = value;
      });
    } else if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        result[key] = value;
      }
    } else {
      for (const [key, value] of Object.entries(headers)) {
        result[key] = value;
      }
    }
    return result;
  }

  private serializeBody(body: unknown): string | null {
    if (body == null) return null;
    if (typeof body === 'string') return this.truncateBody(body);
    if (body instanceof URLSearchParams) return this.truncateBody(body.toString());
    if (body instanceof FormData) {
      const parts: string[] = [];
      body.forEach((value, key) => {
        parts.push(`${key}=${value instanceof File ? `[File: ${value.name}]` : value}`);
      });
      return this.truncateBody(parts.join('&'));
    }
    if (body instanceof ArrayBuffer || body instanceof Blob) return `[Binary: ${body instanceof Blob ? body.size : body.byteLength} bytes]`;
    try {
      return this.truncateBody(JSON.stringify(body));
    } catch {
      return null;
    }
  }

  private truncateBody(text: string): string {
    if (text.length <= MAX_BODY_SIZE) return text;
    return text.slice(0, MAX_BODY_SIZE) + '…[truncated]';
  }

  private parseXhrResponseHeaders(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!raw) return result;

    for (const line of raw.trim().split(/[\r\n]+/)) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      result[key] = value;
    }
    return result;
  }
}
