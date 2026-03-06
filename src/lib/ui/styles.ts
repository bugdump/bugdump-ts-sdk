const COLORS = {
  primary: '#6366f1',
  primaryHover: '#4f46e5',
  primaryText: '#ffffff',
  bg: '#ffffff',
  bgSecondary: '#f9fafb',
  bgHover: '#f3f4f6',
  border: '#e5e7eb',
  borderFocus: '#6366f1',
  text: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  danger: '#ef4444',
  dangerHover: '#dc2626',
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: 'rgba(0, 0, 0, 0.15)',
  shadowLight: 'rgba(0, 0, 0, 0.08)',
};

export function createStyles(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .bd-trigger {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${COLORS.primary};
      color: ${COLORS.primaryText};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px ${COLORS.shadow};
      transition: background-color 0.2s, transform 0.2s, box-shadow 0.2s;
      z-index: 2147483647;
      outline: none;
    }

    .bd-trigger:hover {
      background: ${COLORS.primaryHover};
      transform: scale(1.05);
      box-shadow: 0 6px 16px ${COLORS.shadow};
    }

    .bd-trigger:active {
      transform: scale(0.97);
    }

    .bd-trigger svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .bd-trigger--open svg {
      transition: transform 0.2s;
    }

    .bd-panel {
      position: fixed;
      bottom: 88px;
      right: 20px;
      width: 380px;
      max-height: calc(100vh - 120px);
      background: ${COLORS.bg};
      border-radius: 16px;
      box-shadow: 0 8px 32px ${COLORS.shadow}, 0 2px 8px ${COLORS.shadowLight};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateY(10px);
      opacity: 0;
      transition: transform 0.25s ease-out, opacity 0.25s ease-out;
      pointer-events: none;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: ${COLORS.text};
    }

    .bd-panel--visible {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    .bd-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid ${COLORS.border};
      background: ${COLORS.bgSecondary};
    }

    .bd-panel__title {
      font-size: 16px;
      font-weight: 600;
      color: ${COLORS.text};
    }

    .bd-panel__close {
      background: none;
      border: none;
      cursor: pointer;
      color: ${COLORS.textSecondary};
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background-color 0.15s;
    }

    .bd-panel__close:hover {
      color: ${COLORS.text};
      background: ${COLORS.bgHover};
    }

    .bd-panel__close svg {
      width: 18px;
      height: 18px;
    }

    .bd-panel__body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bd-textarea {
      width: 100%;
      min-height: 100px;
      padding: 10px 12px;
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      resize: vertical;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
      color: ${COLORS.text};
      background: ${COLORS.bg};
      outline: none;
      transition: border-color 0.15s;
    }

    .bd-textarea::placeholder {
      color: ${COLORS.textMuted};
    }

    .bd-textarea:focus {
      border-color: ${COLORS.borderFocus};
    }

    .bd-action-bar {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .bd-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid ${COLORS.border};
      border-radius: 6px;
      background: ${COLORS.bg};
      color: ${COLORS.textSecondary};
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background-color 0.15s;
    }

    .bd-action-btn:hover {
      color: ${COLORS.text};
      border-color: ${COLORS.textSecondary};
      background: ${COLORS.bgSecondary};
    }

    .bd-action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .bd-action-btn svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .bd-attachments {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .bd-attachment {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid ${COLORS.border};
      background: ${COLORS.bgSecondary};
    }

    .bd-attachment img,
    .bd-attachment video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .bd-attachment__icon {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${COLORS.textSecondary};
    }

    .bd-attachment__icon svg {
      width: 24px;
      height: 24px;
    }

    .bd-attachment__remove {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: ${COLORS.danger};
      color: ${COLORS.primaryText};
      border: 2px solid ${COLORS.bg};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      line-height: 1;
      padding: 0;
      transition: background-color 0.15s;
    }

    .bd-attachment__remove:hover {
      background: ${COLORS.dangerHover};
    }

    .bd-attachment__remove svg {
      width: 10px;
      height: 10px;
    }

    .bd-reporter-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      color: ${COLORS.textSecondary};
      padding: 0;
      transition: color 0.15s;
    }

    .bd-reporter-toggle:hover {
      color: ${COLORS.text};
    }

    .bd-reporter-toggle svg {
      width: 14px;
      height: 14px;
      transition: transform 0.2s;
    }

    .bd-reporter-toggle--open svg {
      transform: rotate(90deg);
    }

    .bd-reporter-fields {
      display: none;
      flex-direction: column;
      gap: 8px;
      padding-top: 4px;
    }

    .bd-reporter-fields--visible {
      display: flex;
    }

    .bd-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      font-family: inherit;
      font-size: 14px;
      color: ${COLORS.text};
      background: ${COLORS.bg};
      outline: none;
      transition: border-color 0.15s;
    }

    .bd-input::placeholder {
      color: ${COLORS.textMuted};
    }

    .bd-input:focus {
      border-color: ${COLORS.borderFocus};
    }

    .bd-panel__footer {
      padding: 12px 20px;
      border-top: 1px solid ${COLORS.border};
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .bd-send-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 20px;
      background: ${COLORS.primary};
      color: ${COLORS.primaryText};
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: background-color 0.15s, opacity 0.15s;
    }

    .bd-send-btn:hover {
      background: ${COLORS.primaryHover};
    }

    .bd-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .bd-send-btn svg {
      width: 16px;
      height: 16px;
    }

    .bd-success {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px 20px;
      text-align: center;
    }

    .bd-success svg {
      width: 48px;
      height: 48px;
      color: #22c55e;
    }

    .bd-success__title {
      font-size: 16px;
      font-weight: 600;
    }

    .bd-success__subtitle {
      font-size: 14px;
      color: ${COLORS.textSecondary};
    }

    .bd-annotation-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483647;
      background: ${COLORS.overlay};
      display: flex;
      flex-direction: column;
    }

    .bd-annotation-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.85);
      color: ${COLORS.primaryText};
    }

    .bd-annotation-toolbar button {
      padding: 6px 10px;
      background: transparent;
      color: ${COLORS.primaryText};
      border: 1px solid transparent;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: background-color 0.15s, border-color 0.15s;
    }

    .bd-annotation-toolbar button:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .bd-annotation-toolbar button.active {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .bd-annotation-toolbar__spacer {
      flex: 1;
    }

    .bd-annotation-toolbar__confirm {
      background: #22c55e !important;
      color: ${COLORS.primaryText} !important;
      font-weight: 500;
    }

    .bd-annotation-toolbar__confirm:hover {
      background: #16a34a !important;
    }

    .bd-annotation-toolbar__cancel {
      color: ${COLORS.textMuted} !important;
    }

    .bd-annotation-canvas-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }

    .bd-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid ${COLORS.primaryText};
      border-top-color: transparent;
      border-radius: 50%;
      animation: bd-spin 0.6s linear infinite;
    }

    @keyframes bd-spin {
      to { transform: rotate(360deg); }
    }

    .bd-file-input {
      display: none;
    }

    @media (max-width: 440px) {
      .bd-panel {
        right: 0;
        left: 0;
        bottom: 76px;
        width: 100%;
        max-height: calc(100vh - 100px);
        border-radius: 16px 16px 0 0;
      }
    }
  `;
}
