import type {
  ErrorEventPayload,
  ReportPayload,
  ReportResponse,
  UploadRequest,
  UploadResponse,
  WidgetConfig,
  HttpErrorResponse,
} from './types';

const DEFAULT_TIMEOUT_MS = 30_000;
// Browsers refuse a keepalive request whose body would take the page's in-flight keepalive
// total over 64 KB, so a larger event goes without it.
const KEEPALIVE_MAX_BYTES = 64 * 1024;
const DELIVERY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;

interface RetryOptions {
  attempts: number;
}

export class HttpClient {
  private endpoint: string;
  private apiKey: string;
  private activeXhr: XMLHttpRequest | null = null;
  private abortCount = 0;

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  abort(): void {
    this.abortCount++;
    if (this.activeXhr) {
      this.activeXhr.abort();
      this.activeXhr = null;
    }
  }

  async fetchConfig(): Promise<WidgetConfig> {
    return this.get<WidgetConfig>('/api/widget/v1/config', { attempts: 1 });
  }

  async submitReport(payload: ReportPayload): Promise<ReportResponse> {
    const { taskId, ...rest } = payload;
    const wireBody = taskId !== undefined ? { ...rest, taskPublicId: taskId } : rest;
    return this.post<ReportResponse>('/api/widget/v1/reports', wireBody, { attempts: DELIVERY_ATTEMPTS });
  }

  /** Sent with `keepalive` when small enough, so an event in flight survives the page unloading. */
  async submitErrorEvent(payload: ErrorEventPayload): Promise<void> {
    const body = JSON.stringify(payload);
    await this.send('/api/widget/v1/errors', body, {
      attempts: DELIVERY_ATTEMPTS,
      keepalive: new TextEncoder().encode(body).length < KEEPALIVE_MAX_BYTES,
    });
  }

  async requestUpload(request: UploadRequest): Promise<UploadResponse> {
    return this.post<UploadResponse>('/api/widget/v1/reports/upload', request, { attempts: DELIVERY_ATTEMPTS });
  }

  async uploadFileToS3(
    presignedUrl: string,
    fields: Record<string, string>,
    file: Blob,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const abortCount = this.abortCount;
    return withRetries(DELIVERY_ATTEMPTS, () => {
      // abort() during the wait between attempts cancels the upload as well.
      if (this.abortCount !== abortCount) throw new BugdumpApiError('UPLOAD_ABORTED', 0);
      return this.uploadFileToS3Once(presignedUrl, fields, file, onProgress);
    });
  }

  private async uploadFileToS3Once(
    presignedUrl: string,
    fields: Record<string, string>,
    file: Blob,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }
    formData.append('file', file);

    if (onProgress) {
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        this.activeXhr = xhr;
        xhr.open('POST', presignedUrl);

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          this.activeXhr = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress(100);
            resolve();
          } else {
            reject(new BugdumpApiError('S3_UPLOAD_FAILED', xhr.status));
          }
        });

        xhr.addEventListener('error', () => {
          this.activeXhr = null;
          reject(new BugdumpApiError('S3_UPLOAD_FAILED', 0));
        });

        xhr.addEventListener('abort', () => {
          this.activeXhr = null;
          reject(new BugdumpApiError('UPLOAD_ABORTED', 0));
        });

        xhr.send(formData);
      });
    }

    const response = await fetch(presignedUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new BugdumpApiError('S3_UPLOAD_FAILED', response.status);
    }
  }

  private async get<T>(path: string, { attempts }: RetryOptions): Promise<T> {
    const response = await withRetries(attempts, () =>
      this.request(path, {
        method: 'GET',
        headers: {
          'Bugdump-API-Key': this.apiKey,
        },
      }),
    );
    return (await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown, { attempts }: RetryOptions): Promise<T> {
    const response = await this.send(path, JSON.stringify(body), { attempts, keepalive: false });
    return (await response.json()) as T;
  }

  private send(
    path: string,
    body: string,
    { attempts, keepalive }: RetryOptions & { keepalive: boolean },
  ): Promise<Response> {
    return withRetries(attempts, () =>
      this.request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bugdump-API-Key': this.apiKey,
        },
        body,
        keepalive,
      }),
    );
  }

  /** One attempt, with its own timeout. */
  private async request(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.endpoint}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new BugdumpApiError('REQUEST_TIMEOUT', 0);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let errorBody: HttpErrorResponse | undefined;
      try {
        errorBody = (await response.json()) as HttpErrorResponse;
      } catch {
        // response body is not JSON
      }
      throw new BugdumpApiError(errorBody?.error || `HTTP_${response.status}`, response.status, errorBody?.details);
    }

    return response;
  }
}

export class BugdumpApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: unknown;

  constructor(code: string, statusCode: number, details?: unknown) {
    super(`Bugdump API error: ${code} (${statusCode})`);
    this.name = 'BugdumpApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function withRetries<T>(attempts: number, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }
  }
}

/**
 * Network errors, timeouts, 5xx and a report the API is still processing. No other 4xx, 429
 * included: the widget API sends no `Retry-After`, and its CORS exposes no headers to read one.
 */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof BugdumpApiError)) return true;
  if (error.code === 'UPLOAD_ABORTED') return false;
  return (
    error.statusCode === 0 ||
    error.statusCode >= 500 ||
    (error.statusCode === 409 && error.code === 'REQUEST_IN_PROGRESS')
  );
}

/** 1 s, 2 s, 4 s, each ±20 %. */
function retryDelayMs(attempt: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) * (0.8 + Math.random() * 0.4);
}
