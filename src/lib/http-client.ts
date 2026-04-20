import type {
  ReportPayload,
  ReportResponse,
  UploadRequest,
  UploadResponse,
  WidgetConfig,
  HttpErrorResponse,
} from './types';

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpClient {
  private endpoint: string;
  private apiKey: string;
  private activeXhr: XMLHttpRequest | null = null;

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  abort(): void {
    if (this.activeXhr) {
      this.activeXhr.abort();
      this.activeXhr = null;
    }
  }

  async fetchConfig(): Promise<WidgetConfig> {
    return this.get<WidgetConfig>('/api/widget/v1/config');
  }

  async submitReport(payload: ReportPayload): Promise<ReportResponse> {
    const { taskId, ...rest } = payload;
    const wireBody = taskId !== undefined ? { ...rest, taskPublicId: taskId } : rest;
    return this.post<ReportResponse>('/api/widget/v1/reports', wireBody);
  }

  async requestUpload(request: UploadRequest): Promise<UploadResponse> {
    return this.post<UploadResponse>('/api/widget/v1/reports/upload', request);
  }

  async uploadFileToS3(
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

  private async get<T>(path: string): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Bugdump-API-Key': this.apiKey,
        },
        signal: controller.signal,
      });
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
      throw new BugdumpApiError(
        errorBody?.error || `HTTP_${response.status}`,
        response.status,
        errorBody?.details,
      );
    }

    return (await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bugdump-API-Key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
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
      throw new BugdumpApiError(
        errorBody?.error || `HTTP_${response.status}`,
        response.status,
        errorBody?.details,
      );
    }

    return (await response.json()) as T;
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
