export function getAnnotationStyles(): string {
  return `
    :host {
      --bd-primary: #6366f1;
      --bd-primary-hover: #4f46e5;
      --bd-bg: #ffffff;
      --bd-bg-secondary: #f9fafb;
      --bd-bg-hover: #f3f4f6;
      --bd-border: #e5e7eb;
      --bd-text: #111827;
      --bd-text-secondary: #6b7280;
      --bd-danger: #ef4444;
      --bd-shadow: rgba(0, 0, 0, 0.15);
      --bd-shadow-light: rgba(0, 0, 0, 0.08);
      --bd-error-bg: #fef2f2;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --bd-bg: #1a1a2e;
        --bd-bg-secondary: #16162a;
        --bd-bg-hover: #232340;
        --bd-border: #2d2d50;
        --bd-text: #e5e7eb;
        --bd-text-secondary: #9ca3af;
        --bd-shadow: rgba(0, 0, 0, 0.4);
        --bd-shadow-light: rgba(0, 0, 0, 0.2);
        --bd-error-bg: #2d1b1b;
      }
    }

    .bd-annotation-overlay {
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    .bd-annotation-toolbar {
      position: fixed;
      bottom: 88px;
      right: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: var(--bd-bg);
      border-radius: 14px;
      box-shadow: 0 8px 32px var(--bd-shadow), 0 2px 8px var(--bd-shadow-light);
      z-index: 1;
      box-sizing: border-box;
    }

    .bd-annotation-toolbar__group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .bd-annotation-tool-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      background: none;
      color: var(--bd-text-secondary);
      border: 1px solid var(--bd-border);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .bd-annotation-tool-btn svg {
      width: 16px;
      height: 16px;
    }

    .bd-annotation-tool-btn:hover {
      color: var(--bd-text);
      border-color: var(--bd-text-secondary);
      background: var(--bd-bg-hover);
    }

    .bd-annotation-tool-btn.active {
      color: var(--bd-primary);
      border-color: var(--bd-primary);
      background: rgba(99, 102, 241, 0.15);
    }

    .bd-annotation-toolbar__divider {
      width: 1px;
      height: 24px;
      background: var(--bd-border);
    }

    .bd-annotation-toolbar__colors {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .bd-annotation-color-btn {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid var(--bd-border);
      cursor: pointer;
      padding: 0;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }

    .bd-annotation-color-btn:hover {
      transform: scale(1.2);
      border-color: var(--bd-text-secondary);
    }

    .bd-annotation-color-btn.active {
      border-color: var(--bd-text);
      transform: scale(1.15);
      box-shadow: 0 0 6px var(--bd-shadow);
    }

    .bd-annotation-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      background: none;
      color: var(--bd-text-secondary);
      border: 1px solid var(--bd-border);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .bd-annotation-action-btn svg {
      width: 16px;
      height: 16px;
    }

    .bd-annotation-action-btn:hover {
      color: var(--bd-text);
      border-color: var(--bd-text-secondary);
      background: var(--bd-bg-hover);
    }

    .bd-annotation-toolbar__cancel {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      background: none;
      color: var(--bd-text-secondary);
      border: 1px solid var(--bd-border);
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .bd-annotation-toolbar__cancel svg {
      width: 14px;
      height: 14px;
    }

    .bd-annotation-toolbar__cancel:hover {
      color: var(--bd-danger);
      border-color: var(--bd-danger);
      background: var(--bd-error-bg);
    }

    .bd-annotation-toolbar__confirm {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 14px;
      background: var(--bd-primary);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .bd-annotation-toolbar__confirm svg {
      width: 14px;
      height: 14px;
    }

    .bd-annotation-toolbar__confirm:hover {
      background: var(--bd-primary-hover);
    }

    @media (max-width: 440px) {
      .bd-annotation-toolbar {
        right: 8px;
        left: 8px;
        bottom: 76px;
        border-radius: 14px;
      }
    }

    .bd-annotation-canvas-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
  `;
}
