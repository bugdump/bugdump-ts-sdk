import { createStyles } from './styles';
import { closeIcon, resolveIcon, bugIcon } from './icons';
import { Panel } from './panel';
import { containKeyboardEvents } from './panel-utils';
import type { PanelSubmitData, PanelFeatures } from './panel';
import type { BugdumpPosition, BugdumpTheme, BugdumpTranslations, ReportResponse } from '../types';
import type { SessionReplayCollector } from '../collectors/session-replay';
import type { ActionCollector } from '../collectors/action';

const BUBBLE_DISMISSED_KEY = 'bugdump-bubble-dismissed';

export class Widget {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  private anchor: HTMLDivElement;
  private dock: HTMLDivElement;
  private triggerBtn: HTMLButtonElement;
  private bubble: HTMLDivElement | null = null;
  private panel: Panel;
  private open = false;
  private minimized = false;
  private triggerIconHtml: string;
  private destroyed = false;

  private onSubmit: ((data: PanelSubmitData) => Promise<ReportResponse>) | null = null;

  constructor(options?: {
    hideButton?: boolean;
    icon?: string;
    bubbleText?: string;
    features?: PanelFeatures;
    theme?: BugdumpTheme;
    position?: BugdumpPosition;
    translations?: BugdumpTranslations;
  }) {
    this.host = document.createElement('bugdump-widget');
    // Mark the host with rrweb's block class so the session replay never records the widget
    // itself. The replay now runs continuously while the panel is open, and the panel must
    // stay out of the recording (it is also a closed shadow root, so its contents are opaque
    // to rrweb regardless — this is the explicit, defensive guard).
    this.host.classList.add('bugdump-block');
    this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';

    this.shadowRoot = this.host.attachShadow({ mode: 'closed' });
    containKeyboardEvents(this.shadowRoot);
    this.applyTheme(options?.theme);
    this.applyPosition(options?.position);

    const style = document.createElement('style');
    style.textContent = createStyles();
    this.shadowRoot.appendChild(style);

    this.anchor = document.createElement('div');
    this.anchor.className = 'bd-anchor';

    this.dock = document.createElement('div');
    this.dock.className = 'bd-dock';
    if (options?.hideButton) {
      this.dock.style.display = 'none';
    }

    this.triggerIconHtml = options?.icon ? resolveIcon(options.icon) : bugIcon();
    this.triggerBtn = this.createTriggerButton(options?.translations?.triggerTitle ?? options?.translations?.title);

    const bubbleText = options?.bubbleText?.trim();
    if (bubbleText && !options?.hideButton && !isBubbleDismissed()) {
      this.bubble = this.createBubble(bubbleText);
      this.dock.appendChild(this.bubble);
    }
    this.dock.appendChild(this.triggerBtn);

    this.panel = new Panel(this.shadowRoot, options?.features, options?.translations);
    this.anchor.appendChild(this.panel.getElement());
    this.anchor.appendChild(this.dock);
    this.shadowRoot.appendChild(this.anchor);

    this.panel.setOnClose(() => this.close());
    this.panel.setOnMinimize(() => this.minimizePanel());

    this.mountHost();
  }

  /**
   * The embed script can run while the parser is still inside <head> — React 19 hoists an
   * async <script src> there, and a fast response (localhost, warm cache) lands before the
   * body is parsed. A missing body means the parser is still running, so DOMContentLoaded
   * cannot have fired yet. Everything else works on the detached host in the meantime.
   */
  private mountHost(): void {
    if (document.body) {
      document.body.appendChild(this.host);
      return;
    }

    document.addEventListener(
      'DOMContentLoaded',
      () => {
        if (this.destroyed) return;
        document.body.appendChild(this.host);
      },
      { once: true },
    );
  }

  setOnSubmit(handler: (data: PanelSubmitData) => Promise<ReportResponse>): void {
    this.onSubmit = handler;
    this.panel.setOnSubmit(handler);
  }

  setOnRecordingChange(handler: (isRecording: boolean) => void): void {
    this.panel.setOnRecordingChange(handler);
  }

  setReporterInfo(name: string, email: string): void {
    this.panel.setReporterInfo(name, email);
  }

  setUploadProgress(current: number, total: number, filePercent: number): void {
    this.panel.setUploadProgress(current, total, filePercent);
  }

  setMaxMediaSize(size: number): void {
    this.panel.setMaxMediaSize(size);
  }

  updateFeatures(features: Partial<PanelFeatures>): void {
    this.panel.updateFeatures(features);
  }

  setSessionReplayCollector(collector: SessionReplayCollector): void {
    this.panel.setSessionReplayCollector(collector);
  }

  setActionCollector(collector: ActionCollector): void {
    this.panel.setActionCollector(collector);
  }

  setRemoveBranding(remove: boolean): void {
    this.panel.setRemoveBranding(remove);
  }

  setPortalUrl(url: string | null | undefined): void {
    this.panel.setPortalUrl(url);
  }

  setDashboardUrl(url: string | null | undefined): void {
    this.panel.setDashboardUrl(url);
  }

  setShowReportLink(show: boolean): void {
    this.panel.setShowReportLink(show);
  }

  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.openPanel();
    }
  }

  openPanel(): void {
    if (this.open) return;
    this.open = true;

    this.removeBubble();
    this.minimized = false;
    this.triggerBtn.classList.add('bd-trigger--open');
    this.triggerBtn.innerHTML = closeIcon();
    this.panel.show();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.minimized = false;
    this.triggerBtn.classList.remove('bd-trigger--open');
    this.triggerBtn.innerHTML = this.triggerIconHtml;
    this.panel.hide();
  }

  private minimizePanel(): void {
    if (!this.open) return;
    this.open = false;
    this.minimized = true;
    this.triggerBtn.classList.remove('bd-trigger--open');
    this.triggerBtn.innerHTML = this.triggerIconHtml;
    this.panel.minimize();
  }

  isOpen(): boolean {
    return this.open;
  }

  destroy(): void {
    this.destroyed = true;
    this.panel.destroy();
    this.host.remove();
  }

  private applyTheme(theme?: BugdumpTheme): void {
    this.host.classList.remove('bd-theme-dark', 'bd-theme-auto');
    if (theme === 'dark') {
      this.host.classList.add('bd-theme-dark');
    } else if (theme === 'auto') {
      this.host.classList.add('bd-theme-auto');
    }
  }

  private applyPosition(position?: BugdumpPosition): void {
    this.host.classList.toggle('bd-pos-left', position === 'bottom-left');
  }

  private createTriggerButton(title?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'bd-trigger';
    const label = title ?? 'Send feedback';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.innerHTML = this.triggerIconHtml;
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }

  private createBubble(text: string): HTMLDivElement {
    const bubble = document.createElement('div');
    bubble.className = 'bd-bubble';

    const textBtn = document.createElement('button');
    textBtn.className = 'bd-bubble__text';
    textBtn.textContent = text;
    textBtn.addEventListener('click', () => this.openPanel());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bd-bubble__close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.innerHTML = closeIcon();
    closeBtn.addEventListener('click', () => {
      markBubbleDismissed();
      this.removeBubble();
    });

    bubble.appendChild(textBtn);
    bubble.appendChild(closeBtn);
    return bubble;
  }

  private removeBubble(): void {
    if (!this.bubble) return;
    this.bubble.remove();
    this.bubble = null;
  }
}

// localStorage can throw (privacy mode, disabled storage) — the bubble then
// simply reappears on the next page load.
function isBubbleDismissed(): boolean {
  try {
    return localStorage.getItem(BUBBLE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function markBubbleDismissed(): void {
  try {
    localStorage.setItem(BUBBLE_DISMISSED_KEY, '1');
  } catch {
    // ignore
  }
}
