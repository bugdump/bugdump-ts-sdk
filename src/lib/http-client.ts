import type {
  ReportPayload,
  ReportResponse,
  UploadRequest,
  UploadResponse,
  HttpErrorResponse,
} from './types';

export class HttpClient {
  private endpoint: string;
  private apiKey: string;

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async submitReport(payload: ReportPayload): Promise<ReportResponse> {
    return this.post<ReportResponse>('/api/widget/v1/reports', payload);
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
        xhr.open('POST', presignedUrl);

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress(100);
            resolve();
          } else {
            reject(new BugdumpApiError('S3_UPLOAD_FAILED', xhr.status));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new BugdumpApiError('S3_UPLOAD_FAILED', 0));
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

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.endpoint}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Bugdump-API-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

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
