export function createStyles(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      --bd-primary: #6d5ef5;
      --bd-primary-hover: #5a4bdc;
      --bd-primary-text: #ffffff;
      --bd-bg: #ffffff;
      --bd-bg-secondary: #f6f7f9;
      --bd-bg-hover: #eceef2;
      --bd-input-bg: #ffffff;
      --bd-border: rgba(16, 19, 25, 0.08);
      --bd-border-dashed: rgba(16, 19, 25, 0.16);
      --bd-border-focus: #6d5ef5;
      --bd-text: #101319;
      --bd-text-secondary: #5c6270;
      --bd-text-muted: #959bab;
      --bd-danger: #b1300f;
      --bd-danger-hover: #8f2509;
      --bd-shadow: rgba(16, 19, 25, 0.1);
      --bd-shadow-light: rgba(16, 19, 25, 0.04);
      --bd-error-bg: #fdeee9;
      --bd-error-text: #b1300f;
      --bd-error-border: rgba(177, 48, 15, 0.3);
      --bd-mint: #dcf3e7;
      --bd-lavender: #e9e5ff;
      --bd-peach: #ffe9d6;
      --bd-tone-text: #101319;
    }

    :host(.bd-theme-dark) {
      --bd-primary: #a78bfa;
      --bd-primary-hover: #b9a4fb;
      --bd-primary-text: #101319;
      --bd-bg: #171922;
      --bd-bg-secondary: #101319;
      --bd-bg-hover: #1f2230;
      --bd-input-bg: #101319;
      --bd-border: rgba(230, 232, 238, 0.1);
      --bd-border-dashed: rgba(230, 232, 238, 0.18);
      --bd-border-focus: #a78bfa;
      --bd-text: #e6e8ee;
      --bd-text-secondary: #8b91a1;
      --bd-text-muted: #666c7a;
      --bd-shadow: rgba(0, 0, 0, 0.45);
      --bd-shadow-light: rgba(0, 0, 0, 0.25);
      --bd-error-bg: #3a1414;
      --bd-error-text: #ff7a6b;
      --bd-error-border: rgba(255, 122, 107, 0.3);
    }

    @media (prefers-color-scheme: dark) {
      :host(.bd-theme-auto) {
        --bd-primary: #a78bfa;
        --bd-primary-hover: #b9a4fb;
        --bd-primary-text: #101319;
        --bd-bg: #171922;
        --bd-bg-secondary: #101319;
        --bd-bg-hover: #1f2230;
        --bd-input-bg: #101319;
        --bd-border: rgba(230, 232, 238, 0.1);
        --bd-border-dashed: rgba(230, 232, 238, 0.18);
        --bd-border-focus: #a78bfa;
        --bd-text: #e6e8ee;
        --bd-text-secondary: #8b91a1;
        --bd-text-muted: #666c7a;
        --bd-shadow: rgba(0, 0, 0, 0.45);
        --bd-shadow-light: rgba(0, 0, 0, 0.25);
        --bd-error-bg: #3a1414;
        --bd-error-text: #ff7a6b;
        --bd-error-border: rgba(255, 122, 107, 0.3);
      }
    }

    .bd-anchor {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      box-sizing: border-box;
      max-height: 100vh;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
      pointer-events: none;
      z-index: 2147483647;
    }

    .bd-dock {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
      pointer-events: auto;
    }

    :host(.bd-pos-left) .bd-anchor {
      align-items: flex-start;
    }

    :host(.bd-pos-left) .bd-dock {
      flex-direction: row-reverse;
    }

    .bd-trigger {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px var(--bd-shadow);
      transition: background-color 0.2s, transform 0.2s, box-shadow 0.2s;
      flex-shrink: 0;
      outline: none;
    }

    .bd-trigger:hover {
      background: var(--bd-primary-hover);
      transform: scale(1.05);
      box-shadow: 0 6px 16px var(--bd-shadow);
    }

    .bd-trigger:active {
      transform: scale(0.97);
    }

    .bd-trigger:disabled {
      cursor: default;
      opacity: 0.8;
    }

    .bd-trigger:disabled:hover {
      transform: none;
      background: var(--bd-primary);
      box-shadow: 0 4px 12px var(--bd-shadow);
    }

    .bd-trigger svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .bd-trigger img {
      width: 24px;
      height: 24px;
      object-fit: contain;
      pointer-events: none;
    }

    .bd-trigger--open svg {
      transition: transform 0.2s;
    }

    /* Floating teaser bubble next to the trigger button */
    .bd-bubble {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 6px 4px 14px;
      max-width: min(280px, calc(100vw - 130px));
      background: var(--bd-bg);
      color: var(--bd-text);
      border: 1px solid var(--bd-border);
      border-radius: 999px;
      box-shadow: 0 6px 20px var(--bd-shadow), 0 2px 6px var(--bd-shadow-light);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      animation: bd-bubble-in 0.3s ease-out 0.6s both;
    }

    @keyframes bd-bubble-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .bd-bubble__text {
      border: none;
      background: none;
      padding: 4px 0;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--bd-text);
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      outline: none;
    }

    .bd-bubble__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      border: none;
      background: none;
      border-radius: 50%;
      color: var(--bd-text-muted);
      cursor: pointer;
      transition: background-color 0.15s, color 0.15s;
      outline: none;
    }

    .bd-bubble__close:hover {
      background: var(--bd-bg-hover);
      color: var(--bd-text);
    }

    .bd-bubble__close svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .bd-panel {
      width: 380px;
      min-height: 0;
      background: var(--bd-bg);
      border: 1px solid var(--bd-border);
      border-radius: 18px;
      box-shadow: 0 16px 40px var(--bd-shadow), 0 2px 8px var(--bd-shadow-light);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateY(10px);
      opacity: 0;
      transition: transform 0.25s ease-out, opacity 0.25s ease-out;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--bd-text);
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
      padding: 14px 18px;
      border-bottom: 1px solid var(--bd-border);
      background: var(--bd-bg-secondary);
    }

    .bd-panel__heading {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }

    .bd-panel__mascot {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bd-panel__mascot svg {
      width: 28px;
      height: 28px;
    }

    .bd-panel__title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--bd-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bd-panel__header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .bd-panel__close,
    .bd-panel__minimize {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--bd-text-secondary);
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background-color 0.15s;
    }

    .bd-panel__close:hover,
    .bd-panel__minimize:hover {
      color: var(--bd-text);
      background: var(--bd-bg-hover);
    }

    .bd-panel__close svg,
    .bd-panel__minimize svg {
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
      min-height: 56px;
      max-height: 160px;
      padding: 11px 13px;
      border: 1.5px dashed var(--bd-border-dashed);
      border-radius: 12px;
      resize: none;
      overflow-y: auto;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
      color: var(--bd-text);
      background: var(--bd-input-bg);
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .bd-textarea::placeholder {
      color: var(--bd-text-muted);
    }

    .bd-textarea:focus {
      border-color: var(--bd-border-focus);
      border-style: solid;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--bd-primary) 18%, transparent);
    }

    .bd-char-counter {
      align-self: flex-end;
      margin-top: -6px;
      font-size: 11px;
      color: var(--bd-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .bd-char-counter--limit {
      color: var(--bd-danger);
    }

    .bd-action-bar {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
    }

    .bd-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border: 1.5px dashed transparent;
      border-radius: 999px;
      background: var(--bd-bg-hover);
      color: var(--bd-tone-text);
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: filter 0.15s, transform 0.1s, box-shadow 0.15s;
    }

    .bd-action-btn[data-action="attach"] {
      background: var(--bd-lavender);
    }

    .bd-action-btn[data-action="screenshot"] {
      background: var(--bd-mint);
    }

    .bd-action-btn[data-action="record"] {
      background: var(--bd-peach);
    }

    .bd-action-btn:hover {
      filter: brightness(0.96);
      box-shadow: 0 2px 6px var(--bd-shadow-light);
    }

    .bd-action-btn:active {
      transform: translateY(1px);
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
      gap: 10px;
      flex-wrap: wrap;
      padding: 4px;
    }

    .bd-attachment {
      position: relative;
      width: 72px;
      height: 72px;
      border-radius: 10px;
      border: 1px solid var(--bd-border);
      background: var(--bd-bg-secondary);
    }

    .bd-attachment__inner {
      width: 100%;
      height: 100%;
      border-radius: 9px;
      overflow: hidden;
    }

    .bd-attachment img,
    .bd-attachment video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .bd-attachment__icon {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bd-text-secondary);
    }

    .bd-attachment__icon svg {
      width: 24px;
      height: 24px;
    }

    .bd-attachment__remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--bd-danger);
      color: var(--bd-primary-text);
      border: 2px solid var(--bd-bg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      line-height: 1;
      padding: 0;
      transition: background-color 0.15s;
      z-index: 1;
    }

    .bd-attachment__remove:hover {
      background: var(--bd-danger-hover);
    }

    .bd-attachment__remove svg {
      width: 10px;
      height: 10px;
    }

    .bd-attachment__badge {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 3px 5px;
      background: rgba(0, 0, 0, 0.65);
      color: #ffffff;
      font-size: 9px;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      border-radius: 0 0 9px 9px;
    }

    .bd-attachment__badge svg {
      width: 10px;
      height: 10px;
      flex-shrink: 0;
    }

    .bd-attachment[data-annotatable] img {
      cursor: pointer;
      transition: filter 0.15s;
    }

    .bd-attachment[data-annotatable] img:hover {
      filter: brightness(0.85);
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
      color: var(--bd-text-secondary);
      padding: 0;
      transition: color 0.15s;
    }

    .bd-reporter-toggle:hover {
      color: var(--bd-text);
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
      padding: 9px 12px;
      border: 1.5px dashed var(--bd-border-dashed);
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      color: var(--bd-text);
      background: var(--bd-input-bg);
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .bd-input::placeholder {
      color: var(--bd-text-muted);
    }

    .bd-input:focus {
      border-color: var(--bd-border-focus);
      border-style: solid;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--bd-primary) 18%, transparent);
    }

    .bd-panel__footer {
      padding: 12px 20px;
      border-top: 1px solid var(--bd-border);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bd-footer__links {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-right: auto;
    }

    .bd-branding {
      font-size: 11px;
      color: var(--bd-text-secondary);
      text-decoration: none;
      opacity: 0.6;
      transition: opacity 0.15s ease;
    }

    .bd-branding:hover {
      opacity: 1;
    }

    .bd-send-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 20px;
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      border: none;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--bd-primary) 30%, transparent);
      transition: background-color 0.15s, opacity 0.15s, transform 0.1s;
    }

    .bd-send-btn:hover {
      background: var(--bd-primary-hover);
    }

    .bd-send-btn:active {
      transform: translateY(1px);
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
      color: #1f8a5b;
    }

    .bd-success__title {
      font-size: 16px;
      font-weight: 600;
    }

    .bd-success__subtitle {
      font-size: 14px;
      color: var(--bd-text-secondary);
    }

    .bd-success__link-row {
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 100%;
      margin-top: 4px;
    }

    .bd-success__link {
      font-size: 12px;
      color: var(--bd-primary);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .bd-success__link:hover {
      text-decoration: underline;
    }

    .bd-success__copy-btn {
      flex-shrink: 0;
      font-size: 12px;
      padding: 4px 8px;
      border: 1px solid var(--bd-border);
      border-radius: 6px;
      background: var(--bd-bg);
      color: var(--bd-text);
      cursor: pointer;
      white-space: nowrap;
    }

    .bd-success__copy-btn:hover {
      background: var(--bd-bg-hover);
    }

    .bd-success-actions {
      padding: 12px 20px;
      border-top: 1px solid var(--bd-border);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .bd-success-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      border: 1.5px dashed var(--bd-border-dashed);
      border-radius: 999px;
      background: var(--bd-bg);
      color: var(--bd-text);
      cursor: pointer;
      transition: background-color 0.15s, border-color 0.15s;
    }

    .bd-success-action-btn:hover {
      background: var(--bd-bg-hover);
    }

    .bd-success-action-btn--primary {
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      border-color: var(--bd-primary);
    }

    .bd-success-action-btn--primary:hover {
      background: var(--bd-primary-hover);
      border-color: var(--bd-primary-hover);
    }

    .bd-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--bd-primary-text);
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

    .bd-error {
      padding: 8px 12px;
      background: var(--bd-error-bg);
      color: var(--bd-error-text);
      border: 1px solid var(--bd-error-border);
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.4;
    }

    /* Recording bar — compact panel mode */
    .bd-panel--recording {
      border-radius: 14px;
      width: auto;
    }

    .bd-recording-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: var(--bd-bg-secondary);
    }

    .bd-recording-bar__indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--bd-text-muted);
      flex-shrink: 0;
    }

    .bd-panel--recording-active .bd-recording-bar__indicator {
      background: #ef4444;
      animation: bd-pulse 1.2s ease-in-out infinite;
    }

    @keyframes bd-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    .bd-recording-bar__timer {
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--bd-text);
      white-space: nowrap;
      min-width: 72px;
    }

    .bd-recording-bar__canvas {
      display: none;
      flex: 1;
      height: 28px;
      min-width: 60px;
    }

    .bd-panel--recording-active .bd-recording-bar__canvas {
      display: block;
    }

    .bd-recording-bar__mic-group {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    .bd-recording-bar__mic {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      background: none;
      border: 1px solid var(--bd-border);
      border-radius: 50% 0 0 50%;
      margin-right: -1px;
      color: var(--bd-text-secondary);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background-color 0.15s;
    }

    .bd-recording-bar__mic:hover {
      color: var(--bd-text);
      border-color: var(--bd-text-secondary);
      z-index: 1;
    }

    .bd-recording-bar__mic--active {
      color: #ef4444;
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
    }

    .bd-recording-bar__mic--active:hover {
      background: rgba(239, 68, 68, 0.18);
    }

    .bd-recording-bar__mic svg {
      width: 16px;
      height: 16px;
    }

    .bd-recording-bar__mic-select {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      background: none;
      border: 1px solid var(--bd-border);
      border-radius: 0 50% 50% 0;
      color: var(--bd-text-secondary);
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background-color 0.15s;
    }

    .bd-recording-bar__mic-select:hover {
      color: var(--bd-text);
      border-color: var(--bd-text-secondary);
      background: var(--bd-bg-hover);
      z-index: 1;
    }

    .bd-recording-bar__mic-select svg {
      width: 12px;
      height: 12px;
      transform: rotate(-90deg);
    }

    .bd-recording-bar__mic--error {
      color: var(--bd-danger);
      border-color: var(--bd-danger);
      animation: bd-shake 0.4s ease;
    }

    @keyframes bd-shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-3px); }
      40% { transform: translateX(3px); }
      60% { transform: translateX(-2px); }
      80% { transform: translateX(2px); }
    }

    .bd-recording-bar__mic--active + .bd-recording-bar__mic-select {
      border-color: #ef4444;
    }

    .bd-mic-dropdown {
      min-width: 200px;
      max-width: 280px;
      background: var(--bd-bg);
      border: 1px solid var(--bd-border);
      border-radius: 8px;
      box-shadow: 0 4px 16px var(--bd-shadow);
      overflow: hidden;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }

    .bd-mic-dropdown__item {
      display: block;
      width: 100%;
      padding: 8px 12px;
      background: none;
      border: none;
      border-bottom: 1px solid var(--bd-border);
      color: var(--bd-text);
      font-size: 12px;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background-color 0.15s;
    }

    .bd-mic-dropdown__item:last-child {
      border-bottom: none;
    }

    .bd-mic-dropdown__item:hover {
      background: var(--bd-bg-hover);
    }

    .bd-mic-dropdown__item--active {
      color: var(--bd-primary);
      font-weight: 500;
    }

    .bd-recording-bar__start {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      background: var(--bd-primary);
      color: var(--bd-primary-text);
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 0.15s;
    }

    .bd-recording-bar__start:hover {
      background: var(--bd-primary-hover);
    }

    .bd-recording-bar__start svg {
      width: 14px;
      height: 14px;
    }

    .bd-recording-bar__stop {
      display: none;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 0.15s;
    }

    .bd-recording-bar__stop:hover {
      background: #dc2626;
    }

    .bd-recording-bar__stop svg {
      width: 14px;
      height: 14px;
    }

    .bd-panel--recording-active .bd-recording-bar__start {
      display: none;
    }

    .bd-panel--recording-active .bd-recording-bar__stop {
      display: inline-flex;
    }

    /* DOM mode: rrweb has no audio capture, so hide audio-related controls. */
    .bd-panel--mode-dom .bd-recording-bar__canvas {
      display: none;
    }

    .bd-panel--mode-dom .bd-recording-bar__mic-group {
      display: none;
    }

    .bd-recording-bar__discard {
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
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s, background-color 0.15s;
    }

    .bd-recording-bar__discard:hover {
      color: var(--bd-danger);
      border-color: var(--bd-danger);
      background: var(--bd-error-bg);
    }

    .bd-recording-bar__discard svg {
      width: 14px;
      height: 14px;
    }

    @media (max-width: 440px) {
      .bd-anchor {
        padding: 0;
        gap: 0;
      }

      .bd-dock {
        margin: 0 20px 20px;
      }

      .bd-panel {
        width: 100%;
        border-radius: 16px 16px 0 0;
      }
    }
  `;
}
