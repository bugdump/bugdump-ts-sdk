import { createStyles } from './styles';
import { closeIcon, resolveIcon } from './icons';
import { Panel } from './panel';
import type { PanelSubmitData, PanelFeatures } from './panel';
import type { BugdumpTheme, BugdumpTranslations } from '../types';
import type { SessionReplayCollector } from '../collectors/session-replay';

export class Widget {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  private triggerBtn: HTMLButtonElement;
  private panel: Panel;
  private open = false;
  private triggerIconHtml: string;

  private onSubmit: ((data: PanelSubmitData) => Promise<void>) | null = null;

  constructor(options?: { hideButton?: boolean; icon?: string; features?: PanelFeatures; theme?: BugdumpTheme; translations?: BugdumpTranslations }) {
    this.host = document.createElement('bugdump-widget');
    this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';

    this.shadowRoot = this.host.attachShadow({ mode: 'closed' });
    this.applyTheme(options?.theme);

    const style = document.createElement('style');
    style.textContent = createStyles();
    this.shadowRoot.appendChild(style);

    this.triggerIconHtml = resolveIcon(options?.icon);
    this.triggerBtn = this.createTriggerButton(options?.translations?.title);
    if (options?.hideButton) {
      this.triggerBtn.style.display = 'none';
    }
    this.shadowRoot.appendChild(this.triggerBtn);

    this.panel = new Panel(this.shadowRoot, options?.features, options?.translations);
    this.shadowRoot.appendChild(this.panel.getElement());

    this.panel.setOnClose(() => this.close());

    document.body.appendChild(this.host);
  }

  setOnSubmit(handler: (data: PanelSubmitData) => Promise<void>): void {
    this.onSubmit = handler;
    this.panel.setOnSubmit(handler);
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

  setRemoveBranding(remove: boolean): void {
    this.panel.setRemoveBranding(remove);
  }

  setPortalUrl(url: string | null | undefined): void {
    this.panel.setPortalUrl(url);
  }

  toggle(): void {
    if (this.open) {
      this.close();
    } else {
      this.openPanel();
    }
  }

  async openPanel(): Promise<void> {
    if (this.open) return;
    this.open = true;
    this.triggerBtn.disabled = true;
    this.triggerBtn.innerHTML = '<div class="bd-spinner"></div>';
    await this.panel.attachAutoScreenshot();
    this.triggerBtn.disabled = false;
    this.triggerBtn.classList.add('bd-trigger--open');
    this.triggerBtn.innerHTML = closeIcon();
    this.panel.show();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.triggerBtn.classList.remove('bd-trigger--open');
    this.triggerBtn.innerHTML = this.triggerIconHtml;
    this.panel.hide();
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
    btn.setAttribute('aria-label', title ?? 'Report a bug');
    btn.innerHTML = this.triggerIconHtml;
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }
}
