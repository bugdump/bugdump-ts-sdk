import {
  closeIcon,
  paperclipIcon,
  cameraIcon,
  videoIcon,
  sendIcon,
  chevronIcon,
  checkCircleIcon,
  fileIcon,
  xSmallIcon,
  stopIcon,
} from './icons';
import { captureScreenshot } from '../capture/screenshot';
import { AnnotationOverlay } from '../capture/annotation';
import type { DrawOperation } from '../capture/annotation';

export interface Attachment {
  id: string;
  type: 'screenshot' | 'recording' | 'voice_note' | 'file';
  blob: Blob;
  name: string;
  thumbnailUrl?: string;
  annotations?: DrawOperation[];
}

export interface PanelSubmitData {
  description: string;
  reporterName: string;
  reporterEmail: string;
  attachments: Attachment[];
}

interface PanelElements {
  root: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  nameInput: HTMLInputElement;
  emailInput: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  screenshotBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  attachBtn: HTMLButtonElement;
  fileInput: HTMLInputElement;
  attachmentsList: HTMLDivElement;
  reporterToggle: HTMLButtonElement;
  reporterFields: HTMLDivElement;
  body: HTMLDivElement;
  successView: HTMLDivElement;
}

let attachmentIdCounter = 0;

function generateAttachmentId(): string {
  return `att_${Date.now()}_${++attachmentIdCounter}`;
}

export class Panel {
  private elements: PanelElements;
  private attachments: Attachment[] = [];
  private visible = false;
  private submitting = false;
  private recording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private reporterVisible = false;
  private annotationOverlay: AnnotationOverlay | null = null;
  private annotationContainer: HTMLDivElement | null = null;

  private onSubmit: ((data: PanelSubmitData) => Promise<void>) | null = null;
  private onClose: (() => void) | null = null;

  constructor(private shadowRoot: ShadowRoot) {
    this.elements = this.createDOM();
    this.bindEvents();
  }

  setOnSubmit(handler: (data: PanelSubmitData) => Promise<void>): void {
    this.onSubmit = handler;
  }

  setOnClose(handler: () => void): void {
    this.onClose = handler;
  }

  show(): void {
    this.visible = true;
    this.elements.root.classList.add('bd-panel--visible');
    this.elements.textarea.focus();
  }

  hide(): void {
    this.visible = false;
    this.elements.root.classList.remove('bd-panel--visible');
  }

  isVisible(): boolean {
    return this.visible;
  }

  reset(): void {
    this.elements.textarea.value = '';
    this.elements.nameInput.value = '';
    this.elements.emailInput.value = '';
    this.revokeAttachmentUrls();
    this.attachments = [];
    this.renderAttachments();
    this.showFormView();
    this.setSubmitting(false);
  }

  setReporterInfo(name: string, email: string): void {
    this.elements.nameInput.value = name;
    this.elements.emailInput.value = email;
  }

  getElement(): HTMLDivElement {
    return this.elements.root;
  }

  destroy(): void {
    this.stopRecording();
    this.destroyAnnotation();
    this.revokeAttachmentUrls();
    this.elements.root.remove();
  }

  private createDOM(): PanelElements {
    const root = document.createElement('div');
    root.className = 'bd-panel';

    root.innerHTML = `
      <div class="bd-panel__header">
        <span class="bd-panel__title">Report a bug</span>
        <button class="bd-panel__close" aria-label="Close">${closeIcon()}</button>
      </div>
      <div class="bd-panel__body" data-role="body">
        <textarea class="bd-textarea" placeholder="Describe the bug you found..." rows="4"></textarea>
        <div class="bd-action-bar">
          <button class="bd-action-btn" data-action="attach">${paperclipIcon()} Attach</button>
          <button class="bd-action-btn" data-action="screenshot">${cameraIcon()} Screenshot</button>
          <button class="bd-action-btn" data-action="record">${videoIcon()} Record</button>
        </div>
        <div class="bd-attachments" data-role="attachments"></div>
        <button class="bd-reporter-toggle" data-action="toggle-reporter">
          ${chevronIcon()} Reporter info
        </button>
        <div class="bd-reporter-fields" data-role="reporter-fields">
          <input class="bd-input" type="text" placeholder="Your name" data-role="name" />
          <input class="bd-input" type="email" placeholder="Your email" data-role="email" />
        </div>
        <input class="bd-file-input" type="file" multiple data-role="file-input" />
      </div>
      <div class="bd-success" data-role="success" style="display:none">
        ${checkCircleIcon()}
        <div class="bd-success__title">Bug report sent!</div>
        <div class="bd-success__subtitle">Thank you for your feedback.</div>
      </div>
      <div class="bd-panel__footer">
        <button class="bd-send-btn" data-action="send">${sendIcon()} Send report</button>
      </div>
    `;

    const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;

    const elements: PanelElements = {
      root,
      textarea: q<HTMLTextAreaElement>('.bd-textarea'),
      nameInput: q<HTMLInputElement>('[data-role="name"]'),
      emailInput: q<HTMLInputElement>('[data-role="email"]'),
      sendBtn: q<HTMLButtonElement>('[data-action="send"]'),
      screenshotBtn: q<HTMLButtonElement>('[data-action="screenshot"]'),
      recordBtn: q<HTMLButtonElement>('[data-action="record"]'),
      attachBtn: q<HTMLButtonElement>('[data-action="attach"]'),
      fileInput: q<HTMLInputElement>('[data-role="file-input"]'),
      attachmentsList: q<HTMLDivElement>('[data-role="attachments"]'),
      reporterToggle: q<HTMLButtonElement>('[data-action="toggle-reporter"]'),
      reporterFields: q<HTMLDivElement>('[data-role="reporter-fields"]'),
      body: q<HTMLDivElement>('[data-role="body"]'),
      successView: q<HTMLDivElement>('[data-role="success"]'),
    };

    return elements;
  }

  private bindEvents(): void {
    const closeBtn = this.elements.root.querySelector<HTMLButtonElement>('.bd-panel__close')!;
    closeBtn.addEventListener('click', () => this.handleClose());

    this.elements.sendBtn.addEventListener('click', () => this.handleSubmit());
    this.elements.screenshotBtn.addEventListener('click', () => this.handleScreenshot());
    this.elements.recordBtn.addEventListener('click', () => this.handleRecord());
    this.elements.attachBtn.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.fileInput.addEventListener('change', () => this.handleFileSelect());
    this.elements.reporterToggle.addEventListener('click', () => this.toggleReporter());

    this.elements.attachmentsList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const removeBtn = target.closest<HTMLButtonElement>('[data-remove-id]');
      if (removeBtn) {
        const id = removeBtn.dataset.removeId!;
        this.removeAttachment(id);
      }
    });
  }

  private handleClose(): void {
    this.onClose?.();
  }

  private async handleSubmit(): Promise<void> {
    const description = this.elements.textarea.value.trim();
    if (!description) {
      this.elements.textarea.focus();
      return;
    }

    if (this.submitting || !this.onSubmit) return;

    this.setSubmitting(true);

    try {
      await this.onSubmit({
        description,
        reporterName: this.elements.nameInput.value.trim(),
        reporterEmail: this.elements.emailInput.value.trim(),
        attachments: [...this.attachments],
      });
      this.showSuccessView();
      setTimeout(() => {
        this.reset();
        this.handleClose();
      }, 2000);
    } catch {
      this.setSubmitting(false);
    }
  }

  private async handleScreenshot(): Promise<void> {
    this.elements.screenshotBtn.disabled = true;

    try {
      this.hide();
      await delay(100);

      const result = await captureScreenshot({
        filter: (node) => {
          if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'bugdump-widget') {
            return false;
          }
          return true;
        },
      });

      const imageUrl = URL.createObjectURL(result.blob);
      const image = await loadImage(imageUrl);

      this.showAnnotationOverlay(image, result.blob, result.width, result.height);
    } catch {
      this.show();
    } finally {
      this.elements.screenshotBtn.disabled = false;
    }
  }

  private showAnnotationOverlay(
    image: HTMLImageElement,
    originalBlob: Blob,
    width: number,
    height: number,
  ): void {
    this.annotationContainer = document.createElement('div');
    this.annotationContainer.className = 'bd-annotation-overlay';

    const toolbar = document.createElement('div');
    toolbar.className = 'bd-annotation-toolbar';
    toolbar.innerHTML = `
      <button class="active" data-tool="arrow">Arrow</button>
      <button data-tool="box">Box</button>
      <button data-tool="freehand">Draw</button>
      <button data-tool="text">Text</button>
      <button data-tool="blur">Blur</button>
      <div class="bd-annotation-toolbar__spacer"></div>
      <button data-annotation-action="undo">Undo</button>
      <button class="bd-annotation-toolbar__cancel" data-annotation-action="cancel">Cancel</button>
      <button class="bd-annotation-toolbar__confirm" data-annotation-action="confirm">Done</button>
    `;

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'bd-annotation-canvas-wrap';

    this.annotationContainer.appendChild(toolbar);
    this.annotationContainer.appendChild(canvasWrap);
    document.body.appendChild(this.annotationContainer);

    this.annotationOverlay = new AnnotationOverlay(canvasWrap, width, height);
    this.annotationOverlay.setScreenshotImage(image);

    toolbar.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLButtonElement>('button');
      if (!btn) return;

      const tool = btn.dataset.tool;
      if (tool) {
        this.annotationOverlay?.setTool(tool as 'arrow' | 'box' | 'text' | 'blur' | 'freehand');
        toolbar.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        return;
      }

      const action = btn.dataset.annotationAction;
      if (action === 'undo') {
        this.annotationOverlay?.undo();
      } else if (action === 'cancel') {
        URL.revokeObjectURL(image.src);
        this.destroyAnnotation();
        this.show();
      } else if (action === 'confirm') {
        this.finishAnnotation(originalBlob, image);
      }
    });
  }

  private finishAnnotation(originalBlob: Blob, image: HTMLImageElement): void {
    const annotations = this.annotationOverlay?.getOperations() ?? [];

    const thumbnailUrl = URL.createObjectURL(originalBlob);
    this.addAttachment({
      id: generateAttachmentId(),
      type: 'screenshot',
      blob: originalBlob,
      name: `screenshot-${Date.now()}.jpg`,
      thumbnailUrl,
      annotations: annotations.length > 0 ? annotations : undefined,
    });

    URL.revokeObjectURL(image.src);
    this.destroyAnnotation();
    this.show();
  }

  private destroyAnnotation(): void {
    this.annotationOverlay?.destroy();
    this.annotationOverlay = null;
    this.annotationContainer?.remove();
    this.annotationContainer = null;
  }

  private async handleRecord(): Promise<void> {
    if (this.recording) {
      this.stopRecording();
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: getSupportedMimeType(),
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
        const thumbnailUrl = URL.createObjectURL(blob);
        this.addAttachment({
          id: generateAttachmentId(),
          type: 'recording',
          blob,
          name: `recording-${Date.now()}.webm`,
          thumbnailUrl,
        });
        this.cleanupMediaStream();
        this.setRecordingState(false);
      };

      this.mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        this.stopRecording();
      });

      this.mediaRecorder.start();
      this.setRecordingState(true);
    } catch {
      this.cleanupMediaStream();
      this.setRecordingState(false);
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanupMediaStream();
  }

  private cleanupMediaStream(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  private setRecordingState(isRecording: boolean): void {
    this.recording = isRecording;
    if (isRecording) {
      this.elements.recordBtn.innerHTML = `${stopIcon()} Stop`;
      this.elements.recordBtn.style.color = '#ef4444';
    } else {
      this.elements.recordBtn.innerHTML = `${videoIcon()} Record`;
      this.elements.recordBtn.style.color = '';
    }
  }

  private handleFileSelect(): void {
    const files = this.elements.fileInput.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const isImage = file.type.startsWith('image/');
      const thumbnailUrl = isImage ? URL.createObjectURL(file) : undefined;

      this.addAttachment({
        id: generateAttachmentId(),
        type: 'file',
        blob: file,
        name: file.name,
        thumbnailUrl,
      });
    }

    this.elements.fileInput.value = '';
  }

  private addAttachment(attachment: Attachment): void {
    this.attachments.push(attachment);
    this.renderAttachments();
  }

  private removeAttachment(id: string): void {
    const index = this.attachments.findIndex((a) => a.id === id);
    if (index === -1) return;

    const attachment = this.attachments[index]!;
    if (attachment.thumbnailUrl) {
      URL.revokeObjectURL(attachment.thumbnailUrl);
    }

    this.attachments.splice(index, 1);
    this.renderAttachments();
  }

  private renderAttachments(): void {
    const container = this.elements.attachmentsList;
    container.innerHTML = '';

    if (this.attachments.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    for (const att of this.attachments) {
      const el = document.createElement('div');
      el.className = 'bd-attachment';

      let content: string;
      if (att.thumbnailUrl && att.type !== 'recording') {
        content = `<img src="${att.thumbnailUrl}" alt="${att.name}" />`;
      } else if (att.type === 'recording' && att.thumbnailUrl) {
        content = `<video src="${att.thumbnailUrl}" muted></video>`;
      } else {
        content = `<div class="bd-attachment__icon">${fileIcon()}</div>`;
      }

      el.innerHTML = `
        ${content}
        <button class="bd-attachment__remove" data-remove-id="${att.id}" aria-label="Remove">
          ${xSmallIcon()}
        </button>
      `;

      container.appendChild(el);
    }
  }

  private toggleReporter(): void {
    this.reporterVisible = !this.reporterVisible;
    this.elements.reporterToggle.classList.toggle('bd-reporter-toggle--open', this.reporterVisible);
    this.elements.reporterFields.classList.toggle('bd-reporter-fields--visible', this.reporterVisible);
  }

  private setSubmitting(submitting: boolean): void {
    this.submitting = submitting;
    this.elements.sendBtn.disabled = submitting;
    if (submitting) {
      this.elements.sendBtn.innerHTML = `<span class="bd-spinner"></span> Sending...`;
    } else {
      this.elements.sendBtn.innerHTML = `${sendIcon()} Send report`;
    }
  }

  private showSuccessView(): void {
    this.elements.body.style.display = 'none';
    this.elements.successView.style.display = 'flex';
    const footer = this.elements.root.querySelector<HTMLDivElement>('.bd-panel__footer')!;
    footer.style.display = 'none';
  }

  private showFormView(): void {
    this.elements.body.style.display = 'flex';
    this.elements.successView.style.display = 'none';
    const footer = this.elements.root.querySelector<HTMLDivElement>('.bd-panel__footer')!;
    footer.style.display = 'flex';
  }

  private revokeAttachmentUrls(): void {
    for (const att of this.attachments) {
      if (att.thumbnailUrl) {
        URL.revokeObjectURL(att.thumbnailUrl);
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getSupportedMimeType(): string {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'video/webm';
}
