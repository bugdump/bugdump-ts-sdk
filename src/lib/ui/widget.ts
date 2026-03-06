import { createStyles } from './styles';
import { bugIcon, closeIcon } from './icons';
import { Panel } from './panel';
import type { PanelSubmitData } from './panel';

export class Widget {
  private host: HTMLElement;
  private shadowRoot: ShadowRoot;
  private triggerBtn: HTMLButtonElement;
  private panel: Panel;
  private open = false;

  private onSubmit: ((data: PanelSubmitData) => Promise<void>) | null = null;

  constructor(options?: { hideButton?: boolean }) {
    this.host = document.createElement('bugdump-widget');
    this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';

    this.shadowRoot = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = createStyles();
    this.shadowRoot.appendChild(style);

    this.triggerBtn = this.createTriggerButton();
    if (options?.hideButton) {
      this.triggerBtn.style.display = 'none';
    }
    this.shadowRoot.appendChild(this.triggerBtn);

    this.panel = new Panel(this.shadowRoot);
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
    this.triggerBtn.classList.add('bd-trigger--open');
    this.triggerBtn.innerHTML = closeIcon();
    this.panel.show();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.triggerBtn.classList.remove('bd-trigger--open');
    this.triggerBtn.innerHTML = bugIcon();
    this.panel.hide();
  }

  isOpen(): boolean {
    return this.open;
  }

  destroy(): void {
    this.panel.destroy();
    this.host.remove();
  }

  private createTriggerButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'bd-trigger';
    btn.setAttribute('aria-label', 'Report a bug');
    btn.innerHTML = bugIcon();
    btn.addEventListener('click', () => this.toggle());
    return btn;
  }
}
