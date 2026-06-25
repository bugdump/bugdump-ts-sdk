import { createStyles } from './styles';
import { closeIcon, resolveIcon, bugIcon } from './icons';
import { Panel } from './panel';
import type { PanelSubmitData, PanelFeatures } from './panel';
import type { BugdumpTheme, BugdumpTranslations, ReportResponse } from '../types';
import type { SessionReplayCollector } from '../collectors/session-replay';
import type { ActionCollector } from '../collectors/action';

export class Widget {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  private triggerBtn: HTMLButtonElement;
  private panel: Panel;
  private open = false;
  private minimized = false;
  private triggerIconHtml: string;

  private onSubmit: ((data: PanelSubmitData) => Promise<ReportResponse>) | null = null;

  constructor(options?: { hideButton?: boolean; icon?: string; features?: PanelFeatures; theme?: BugdumpTheme; translations?: BugdumpTranslations }) {
    this.host = document.createElement('bugdump-widget');
    // Mark the host with rrweb's block class so the session replay never records the widget
    // itself. The replay now runs continuously while the panel is open, and the panel must
    // stay out of the recording (it is also a closed shadow root, so its contents are opaque
    // to rrweb regardless — this is the explicit, defensive guard).
    this.host.classList.add('bugdump-block');
    this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';

    this.shadowRoot = this.host.attachShadow({ mode: 'closed' });
    this.applyTheme(options?.theme);

    const style = document.createElement('style');
    style.textContent = createStyles();
    this.shadowRoot.appendChild(style);

    this.triggerIconHtml = options?.icon ? resolveIcon(options.icon) : bugIcon();
    this.triggerBtn = this.createTriggerButton(options?.translations?.title);
    if (options?.hideButton) {
      this.triggerBtn.style.display = 'none';
    }
    this.shadowRoot.appendChild(this.triggerBtn);

    this.panel = new Panel(this.shadowRoot, options?.features, options?.translations);
    this.shadowRoot.appendChild(this.panel.getElement());

    this.panel.setOnClose(() => this.close());
    this.panel.setOnMinimize(() => this.minimizePanel());

    document.body.appendChild(this.host);
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

  private createTriggerButton(title?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'bd-trigger';
    btn.setAttribute('aria-label', title ?? 'Send feedback');
    btn.innerHTML = this.triggerIconHtml;
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }
}
