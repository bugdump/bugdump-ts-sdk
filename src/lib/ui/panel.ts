import {
  closeIcon,
  minimizeIcon,
  paperclipIcon,
  cameraIcon,
  videoIcon,
  sendIcon,
  chevronIcon,
  checkCircleIcon,
  fileIcon,
  xSmallIcon,
  stopIcon,
  arrowToolIcon,
  boxToolIcon,
  penToolIcon,
  textToolIcon,
  blurToolIcon,
  undoIcon,
  checkIcon,
  replayIcon,
  micIcon,
} from './icons';
import { captureScreenshot, captureScreenshotNative } from '../capture/screenshot';
import { AnnotationOverlay, renderOperationsToCanvas } from '../capture/annotation';
import type { TextOperation } from '../capture/annotation';
import { DEFAULT_TRANSLATIONS } from '../core/config';
import type { BugdumpTranslations, CaptureMethod } from '../types';
import type { SessionReplayCollector } from '../collectors/session-replay';

export interface TextAnnotationMeta {
  text: string;
}

export interface Attachment {
  id: string;
  type: 'screenshot' | 'recording' | 'voice_note' | 'session_replay' | 'file';
  blob: Blob;
  name: string;
  thumbnailUrl?: string;
  textAnnotations?: TextAnnotationMeta[];
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface PanelSubmitData {
  description: string;
  reporterName: string;
  reporterEmail: string;
  attachments: Attachment[];
}

export interface PanelFeatures {
  screenshot: boolean;
  screenshotMethod: CaptureMethod;
  screenRecording: boolean;
  screenRecordingMethod: CaptureMethod;
  attachments: boolean;
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

const MAX_ATTACHMENTS = 10;
const DEFAULT_MAX_MEDIA_SIZE = 50 * 1024 * 1024; // 50MB fallback
const RECORDING_TIMESLICE_MS = 1000;
const MAX_RECORDING_DURATION_S = 180; // 3 minutes
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
  private recordedSize = 0;
  private maxMediaSize = DEFAULT_MAX_MEDIA_SIZE;
  private recordingStartTime = 0;
  private recordingTimerInterval: ReturnType<typeof setInterval> | null = null;
  private reporterVisible = false;
  private annotationOverlay: AnnotationOverlay | null = null;
  private annotationContainer: HTMLDivElement | null = null;
  private annotationStyleEl: HTMLStyleElement | null = null;

  private features: PanelFeatures;
  private t: Required<BugdumpTranslations>;

  private onSubmit: ((data: PanelSubmitData) => Promise<void>) | null = null;
  private onClose: (() => void) | null = null;
  private onMinimize: (() => void) | null = null;

  private sessionReplayCollector: SessionReplayCollector | null = null;
  private sessionReplayAttached = false;

  constructor(private shadowRoot: ShadowRoot, features?: PanelFeatures, translations?: BugdumpTranslations) {
    this.features = features ?? { screenshot: true, screenshotMethod: 'dom', screenRecording: true, screenRecordingMethod: 'dom', attachments: true };
    this.t = { ...DEFAULT_TRANSLATIONS, ...translations };
    this.elements = this.createDOM();
    this.applyFeatures();
    this.bindEvents();
  }

  setOnSubmit(handler: (data: PanelSubmitData) => Promise<void>): void {
    this.onSubmit = handler;
  }

  setOnClose(handler: () => void): void {
    this.onClose = handler;
  }

  setOnMinimize(handler: () => void): void {
    this.onMinimize = handler;
  }

  setMaxMediaSize(size: number): void {
    this.maxMediaSize = size;
  }

  setSessionReplayCollector(collector: SessionReplayCollector): void {
    this.sessionReplayCollector = collector;
  }

  setRemoveBranding(remove: boolean): void {
    const branding = this.elements.root.querySelector<HTMLElement>('[data-role="branding"]');
    if (branding) {
      branding.style.display = remove ? 'none' : '';
    }
  }

  setPortalUrl(url: string | null | undefined): void {
    const linksContainer = this.elements.root.querySelector<HTMLElement>('.bd-footer__links');
    if (!linksContainer) return;

    const existing = linksContainer.querySelector<HTMLElement>('[data-role="portal-link"]');
    if (url) {
      if (existing) {
        (existing as HTMLAnchorElement).href = url;
      } else {
        const link = document.createElement('a');
        link.dataset.role = 'portal-link';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'bd-branding';
        link.textContent = 'View reports';
        linksContainer.insertBefore(link, linksContainer.firstChild);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  updateFeatures(features: Partial<PanelFeatures>): void {
    Object.assign(this.features, features);
    this.applyFeatures();
  }

  private applyFeatures(): void {
    this.elements.screenshotBtn.style.display = this.features.screenshot ? '' : 'none';
    this.elements.recordBtn.style.display = this.features.screenRecording ? '' : 'none';
    this.elements.attachBtn.style.display = this.features.attachments ? '' : 'none';
  }

  show(): void {
    if (!this.sessionReplayAttached && this.sessionReplayCollector) {
      this.attachSessionReplay();
    }
    this.visible = true;
    this.elements.root.classList.add('bd-panel--visible');
    this.elements.textarea.focus();
  }

  attachSessionReplay(): void {
    if (!this.sessionReplayCollector) return;

    // Always uses rrweb (library-based) regardless of screenRecordingMethod config —
    // no user permission needed for the automatic session replay capture.
    const events = this.sessionReplayCollector.getSessionReplay();
    this.sessionReplayCollector.stop();

    this.sessionReplayAttached = true;

    if (events.length === 0) return;

    const durationMs = events.length >= 2
      ? events[events.length - 1]!.timestamp - events[0]!.timestamp
      : 0;
    const durationS = Math.round(durationMs / 1000);

    const blob = new Blob([JSON.stringify(events)], { type: 'application/json' });
    this.addAttachment({
      id: generateAttachmentId(),
      type: 'session_replay',
      blob,
      name: `session-replay-${Date.now()}.json`,
      durationSeconds: durationS,
    });

    this.sessionReplayCollector.start();
  }

  async attachAutoScreenshot(): Promise<void> {
    try {
      // Always use DOM-based capture for the initial screenshot regardless of
      // screenshotMethod config — native screen-capture requires user permission
      // and should only be triggered by an explicit user action.
      const result = await captureScreenshot({
        filter: (node) => {
          if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'bugdump-widget') {
            return false;
          }
          return true;
        },
      });

      const thumbnailUrl = URL.createObjectURL(result.blob);
      this.addAttachment({
        id: generateAttachmentId(),
        type: 'screenshot',
        blob: result.blob,
        name: `screenshot-${Date.now()}.jpg`,
        thumbnailUrl,
      });
    } catch (err) {
      console.warn('[Bugdump] Auto screenshot capture failed:', err);
    }
  }

  hide({ preserveAttachments = false } = {}): void {
    this.visible = false;
    this.elements.root.classList.remove('bd-panel--visible');
    if (!preserveAttachments) {
      this.clearAttachments();
    }
    this.restartSessionReplayCollector();
  }

  private clearAttachments(): void {
    this.revokeAttachmentUrls();
    this.attachments = [];
    this.sessionReplayAttached = false;
    this.renderAttachments();
  }

  private restartSessionReplayCollector(): void {
    if (!this.sessionReplayCollector) return;
    this.sessionReplayCollector.stop();
    this.sessionReplayCollector.start();
  }

  minimize(): void {
    this.visible = false;
    this.elements.root.classList.remove('bd-panel--visible');
  }

  isVisible(): boolean {
    return this.visible;
  }

  private autoResizeTextarea(): void {
    const el = this.elements.textarea;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  reset(): void {
    this.elements.textarea.value = '';
    this.elements.textarea.style.height = '';
    this.elements.nameInput.value = '';
    this.elements.emailInput.value = '';
    this.clearAttachments();
    this.restartSessionReplayCollector();
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
        <span class="bd-panel__title">${this.t.title}</span>
        <div class="bd-panel__header-actions">
          <button class="bd-panel__minimize" aria-label="Minimize">${minimizeIcon()}</button>
          <button class="bd-panel__close" aria-label="Close">${closeIcon()}</button>
        </div>
      </div>
      <div class="bd-panel__body" data-role="body">
        <textarea class="bd-textarea" placeholder="${this.t.descriptionPlaceholder}" rows="2"></textarea>
        <div class="bd-action-bar">
          <button class="bd-action-btn" data-action="attach">${paperclipIcon()} ${this.t.attachButton}</button>
          <button class="bd-action-btn" data-action="screenshot">${cameraIcon()} ${this.t.screenshotButton}</button>
          <button class="bd-action-btn" data-action="record">${videoIcon()} ${this.t.recordButton}</button>
        </div>
        <div class="bd-attachments" data-role="attachments"></div>
        <button class="bd-reporter-toggle" data-action="toggle-reporter">
          ${chevronIcon()} ${this.t.reporterToggle}
        </button>
        <div class="bd-reporter-fields" data-role="reporter-fields">
          <input class="bd-input" type="text" placeholder="${this.t.namePlaceholder}" data-role="name" />
          <input class="bd-input" type="email" placeholder="${this.t.emailPlaceholder}" data-role="email" />
        </div>
        <input class="bd-file-input" type="file" multiple data-role="file-input" />
      </div>
      <div class="bd-success" data-role="success" style="display:none">
        ${checkCircleIcon()}
        <div class="bd-success__title">${this.t.successTitle}</div>
        <div class="bd-success__subtitle">${this.t.successSubtitle}</div>
      </div>
      <div class="bd-panel__footer">
        <div class="bd-footer__links">
          <a class="bd-branding" data-role="branding" href="https://bugdump.com?ref=widget" target="_blank" rel="noopener">Powered by Bugdump</a>
        </div>
        <button class="bd-send-btn" data-action="send">${sendIcon()} ${this.t.sendButton}</button>
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

    const minimizeBtn = this.elements.root.querySelector<HTMLButtonElement>('.bd-panel__minimize')!;
    minimizeBtn.addEventListener('click', () => this.onMinimize?.());

    this.elements.sendBtn.addEventListener('click', () => this.handleSubmit());
    this.elements.screenshotBtn.addEventListener('click', () => this.handleScreenshot());
    this.elements.recordBtn.addEventListener('click', () => this.handleRecord());
    this.elements.attachBtn.addEventListener('click', () => this.elements.fileInput.click());
    this.elements.fileInput.addEventListener('change', () => this.handleFileSelect());
    this.elements.reporterToggle.addEventListener('click', () => this.toggleReporter());

    this.elements.textarea.addEventListener('input', () => {
      this.autoResizeTextarea();
    });

    this.elements.attachmentsList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const removeBtn = target.closest<HTMLButtonElement>('[data-remove-id]');
      if (removeBtn) {
        const id = removeBtn.dataset.removeId!;
        this.removeAttachment(id);
        return;
      }

      const annotateImg = target.closest<HTMLElement>('[data-annotate-id]');
      if (annotateImg) {
        const id = annotateImg.dataset.annotateId!;
        this.annotateAttachment(id);
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
      this.showError(this.t.errorMessage);
    }
  }

  private async handleScreenshot(): Promise<void> {
    this.elements.screenshotBtn.disabled = true;
    const originalContent = this.elements.screenshotBtn.innerHTML;
    this.elements.screenshotBtn.innerHTML = `<span class="bd-spinner"></span> ${this.t.capturing}`;

    try {
      this.hide({ preserveAttachments: true });
      await delay(50);

      const result = this.features.screenshotMethod === 'screen-capture'
        ? await captureScreenshotNative()
        : await captureScreenshot({
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
    } catch (err) {
      console.warn('[Bugdump] Screenshot capture failed:', err);
      this.show();
    } finally {
      this.elements.screenshotBtn.disabled = false;
      this.elements.screenshotBtn.innerHTML = originalContent;
    }
  }

  private showAnnotationOverlay(
    image: HTMLImageElement,
    originalBlob: Blob,
    width: number,
    height: number,
    existingAttachmentId?: string,
  ): void {
    this.annotationContainer = document.createElement('div');
    this.annotationContainer.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;';

    const shadow = this.annotationContainer.attachShadow({ mode: 'closed' });
    this.annotationStyleEl = document.createElement('style');
    this.annotationStyleEl.textContent = getAnnotationStyles();
    shadow.appendChild(this.annotationStyleEl);

    const innerRoot = document.createElement('div');
    innerRoot.className = 'bd-annotation-overlay';
    shadow.appendChild(innerRoot);

    const toolbar = document.createElement('div');
    toolbar.className = 'bd-annotation-toolbar';
    toolbar.innerHTML = `
      <div class="bd-annotation-toolbar__group">
        <button class="bd-annotation-tool-btn active" data-tool="arrow" title="${this.t.arrowTool}">${arrowToolIcon()}</button>
        <button class="bd-annotation-tool-btn" data-tool="box" title="${this.t.rectangleTool}">${boxToolIcon()}</button>
        <button class="bd-annotation-tool-btn" data-tool="freehand" title="${this.t.drawTool}">${penToolIcon()}</button>
        <button class="bd-annotation-tool-btn" data-tool="text" title="${this.t.textTool}">${textToolIcon()}</button>
        <button class="bd-annotation-tool-btn" data-tool="blur" title="${this.t.blurTool}">${blurToolIcon()}</button>
      </div>
      <div class="bd-annotation-toolbar__colors">
        <button class="bd-annotation-color-btn active" data-color="#ff0000" style="background:#ff0000" title="Red"></button>
        <button class="bd-annotation-color-btn" data-color="#ffcc00" style="background:#ffcc00" title="Yellow"></button>
        <button class="bd-annotation-color-btn" data-color="#00cc44" style="background:#00cc44" title="Green"></button>
        <button class="bd-annotation-color-btn" data-color="#0099ff" style="background:#0099ff" title="Blue"></button>
        <button class="bd-annotation-color-btn" data-color="#ffffff" style="background:#ffffff" title="White"></button>
      </div>
      <div class="bd-annotation-toolbar__spacer"></div>
      <button class="bd-annotation-action-btn" data-annotation-action="undo" title="${this.t.undo}">${undoIcon()}</button>
      <div class="bd-annotation-toolbar__divider"></div>
      <button class="bd-annotation-toolbar__cancel" data-annotation-action="cancel">${closeIcon()} ${this.t.cancel}</button>
      <button class="bd-annotation-toolbar__confirm" data-annotation-action="confirm">${checkIcon()} ${this.t.done}</button>
    `;

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'bd-annotation-canvas-wrap';

    innerRoot.appendChild(toolbar);
    innerRoot.appendChild(canvasWrap);
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

      const color = btn.dataset.color;
      if (color) {
        this.annotationOverlay?.setColor(color);
        toolbar.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => b.classList.remove('active'));
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
        this.finishAnnotation(originalBlob, image, existingAttachmentId);
      }
    });
  }

  private async annotateAttachment(id: string): Promise<void> {
    const attachment = this.attachments.find((a) => a.id === id);
    if (!attachment) return;

    const imageUrl = URL.createObjectURL(attachment.blob);
    try {
      const image = await loadImage(imageUrl);
      this.hide({ preserveAttachments: true });
      this.showAnnotationOverlay(image, attachment.blob, image.naturalWidth, image.naturalHeight, id);
    } catch {
      URL.revokeObjectURL(imageUrl);
    }
  }

  private async finishAnnotation(originalBlob: Blob, image: HTMLImageElement, existingAttachmentId?: string): Promise<void> {
    const operations = this.annotationOverlay?.getOperations() ?? [];

    let blob: Blob;
    let textAnnotations: TextAnnotationMeta[] | undefined;

    if (operations.length > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);

      const scaleX = image.naturalWidth / this.annotationOverlay!.getCanvasWidth();
      const scaleY = image.naturalHeight / this.annotationOverlay!.getCanvasHeight();
      ctx.save();
      ctx.scale(scaleX, scaleY);
      renderOperationsToCanvas(ctx, operations);
      ctx.restore();

      blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92);
      });

      const textOps = operations.filter((op): op is TextOperation => op.tool === 'text');
      if (textOps.length > 0) {
        textAnnotations = textOps.map((op) => ({
          text: op.text,
        }));
      }
    } else {
      blob = originalBlob;
    }

    const thumbnailUrl = URL.createObjectURL(blob);

    if (existingAttachmentId) {
      const index = this.attachments.findIndex((a) => a.id === existingAttachmentId);
      if (index !== -1) {
        const existing = this.attachments[index]!;
        if (existing.thumbnailUrl) {
          URL.revokeObjectURL(existing.thumbnailUrl);
        }
        this.attachments[index] = {
          ...existing,
          blob,
          thumbnailUrl,
          textAnnotations,
        };
        this.renderAttachments();
      }
    } else {
      this.addAttachment({
        id: generateAttachmentId(),
        type: 'screenshot',
        blob,
        name: `screenshot-${Date.now()}.jpg`,
        thumbnailUrl,
        textAnnotations,
      });
    }

    URL.revokeObjectURL(image.src);
    this.destroyAnnotation();
    this.show();
  }

  private destroyAnnotation(): void {
    this.annotationOverlay?.destroy();
    this.annotationOverlay = null;
    this.annotationContainer?.remove();
    this.annotationContainer = null;
    this.annotationStyleEl?.remove();
    this.annotationStyleEl = null;
  }

  private async handleRecord(): Promise<void> {
    if (this.recording) {
      this.stopRecording();
      return;
    }

    if (this.features.screenRecordingMethod === 'dom') {
      this.handleRecordDom();
    } else {
      await this.handleRecordNative();
    }
  }

  private handleRecordDom(): void {
    if (!this.sessionReplayCollector) {
      console.warn('[Bugdump] Session replay collector not available for dom recording.');
      return;
    }

    this.sessionReplayCollector.startRecording();
    this.setRecordingState(true);
  }

  private async handleRecordNative(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);

      this.recordedChunks = [];
      this.recordedSize = 0;
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: getSupportedMimeType(),
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedSize += e.data.size;

          if (this.recordedSize > this.maxMediaSize) {
            this.stopRecording();
            return;
          }

          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
        const thumbnailUrl = URL.createObjectURL(blob);
        const recordingEndedAt = Date.now();
        this.addAttachment({
          id: generateAttachmentId(),
          type: 'recording',
          blob,
          name: `recording-${Date.now()}.webm`,
          thumbnailUrl,
          metadata: {
            recordingStartedAt: this.recordingStartTime,
            recordingEndedAt,
            durationMs: recordingEndedAt - this.recordingStartTime,
          },
        });
        this.cleanupMediaStream();
        this.setRecordingState(false);
      };

      this.mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        this.stopRecording();
      });

      this.mediaRecorder.start(RECORDING_TIMESLICE_MS);
      this.setRecordingState(true);
    } catch {
      this.cleanupMediaStream();
      this.setRecordingState(false);
    }
  }

  private stopRecording(): void {
    if (this.features.screenRecordingMethod === 'dom') {
      this.stopRecordingDom();
    } else {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      this.cleanupMediaStream();
    }
  }

  private stopRecordingDom(): void {
    if (!this.sessionReplayCollector) {
      this.setRecordingState(false);
      return;
    }

    const recordingEvents = this.sessionReplayCollector.stopRecording();

    if (recordingEvents.length > 0) {
      const firstTs = recordingEvents[0]!.timestamp;
      const lastTs = recordingEvents[recordingEvents.length - 1]!.timestamp;
      const blob = new Blob([JSON.stringify(recordingEvents)], { type: 'application/json' });
      this.addAttachment({
        id: generateAttachmentId(),
        type: 'recording',
        blob,
        name: `recording-${Date.now()}.json`,
        metadata: {
          recordingStartedAt: firstTs,
          recordingEndedAt: lastTs,
          durationMs: lastTs - firstTs,
        },
      });
    }

    this.setRecordingState(false);
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
      this.recordingStartTime = Date.now();
      this.updateRecordingTimer();
      this.recordingTimerInterval = setInterval(() => this.updateRecordingTimer(), 1000);
      this.elements.recordBtn.style.color = '#ef4444';
    } else {
      if (this.recordingTimerInterval) {
        clearInterval(this.recordingTimerInterval);
        this.recordingTimerInterval = null;
      }
      this.elements.recordBtn.innerHTML = `${videoIcon()} ${this.t.recordButton}`;
      this.elements.recordBtn.style.color = '';
    }
  }

  private updateRecordingTimer(): void {
    const elapsedS = Math.floor((Date.now() - this.recordingStartTime) / 1000);

    if (elapsedS >= MAX_RECORDING_DURATION_S) {
      this.stopRecording();
      return;
    }

    const minutes = Math.floor(elapsedS / 60);
    const seconds = elapsedS % 60;
    const elapsed = `${minutes}:${String(seconds).padStart(2, '0')}`;
    const maxMin = Math.floor(MAX_RECORDING_DURATION_S / 60);
    const maxSec = MAX_RECORDING_DURATION_S % 60;
    const limit = `${maxMin}:${String(maxSec).padStart(2, '0')}`;
    this.elements.recordBtn.innerHTML = `${stopIcon()} ${this.t.stop} (${elapsed} / ${limit})`;
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
    if (this.attachments.length >= MAX_ATTACHMENTS) return;
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

      const isAnnotatable = att.type === 'screenshot' || (att.type === 'file' && att.blob.type.startsWith('image/'));

      if (isAnnotatable) {
        el.dataset.annotatable = '';
      }

      const inner = document.createElement('div');
      inner.className = 'bd-attachment__inner';

      if (att.thumbnailUrl && att.type !== 'recording') {
        const img = document.createElement('img');
        img.src = att.thumbnailUrl;
        img.alt = att.name;
        if (isAnnotatable) {
          img.dataset.annotateId = att.id;
        }
        inner.appendChild(img);
      } else if (att.type === 'recording' && att.thumbnailUrl) {
        const video = document.createElement('video');
        video.src = att.thumbnailUrl;
        video.muted = true;
        inner.appendChild(video);
      } else if (att.type === 'session_replay') {
        const iconDiv = document.createElement('div');
        iconDiv.className = 'bd-attachment__icon';
        iconDiv.innerHTML = replayIcon();
        inner.appendChild(iconDiv);
      } else {
        const iconDiv = document.createElement('div');
        iconDiv.className = 'bd-attachment__icon';
        iconDiv.innerHTML = fileIcon();
        inner.appendChild(iconDiv);
      }

      const badge = document.createElement('div');
      badge.className = 'bd-attachment__badge';
      badge.innerHTML = this.getAttachmentBadgeContent(att);
      inner.appendChild(badge);

      el.appendChild(inner);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'bd-attachment__remove';
      removeBtn.dataset.removeId = att.id;
      removeBtn.setAttribute('aria-label', 'Remove');
      removeBtn.innerHTML = xSmallIcon();
      el.appendChild(removeBtn);

      container.appendChild(el);
    }
  }

  private getAttachmentBadgeContent(att: Attachment): string {
    switch (att.type) {
      case 'screenshot':
        return `${cameraIcon()} ${this.t.badgeScreenshot}`;
      case 'recording':
        return `${videoIcon()} ${this.t.badgeRecording}`;
      case 'session_replay': {
        const label = att.durationSeconds != null && att.durationSeconds > 0
          ? `${this.t.badgeReplay} (${formatDuration(att.durationSeconds)})`
          : this.t.badgeReplay;
        return `${replayIcon()} ${label}`;
      }
      case 'voice_note':
        return `${micIcon()} ${this.t.badgeVoiceNote}`;
      case 'file':
        return `${fileIcon()} ${att.name}`;
    }
  }

  private toggleReporter(): void {
    this.reporterVisible = !this.reporterVisible;
    this.elements.reporterToggle.classList.toggle('bd-reporter-toggle--open', this.reporterVisible);
    this.elements.reporterFields.classList.toggle('bd-reporter-fields--visible', this.reporterVisible);
  }

  setUploadProgress(current: number, total: number, filePercent: number): void {
    if (total === 0) return;
    const overallPercent = Math.round(((current - 1 + filePercent / 100) / total) * 100);
    this.elements.sendBtn.innerHTML = `<span class="bd-spinner"></span> Uploading ${current}/${total}… ${overallPercent}%`;
  }

  private setSubmitting(submitting: boolean): void {
    this.submitting = submitting;
    this.elements.sendBtn.disabled = submitting;
    if (submitting) {
      this.elements.sendBtn.innerHTML = `<span class="bd-spinner"></span> ${this.t.sending}`;
    } else {
      this.elements.sendBtn.innerHTML = `${sendIcon()} ${this.t.sendButton}`;
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

  private showError(message: string): void {
    const existing = this.elements.body.querySelector('.bd-error');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'bd-error';
    el.textContent = message;
    this.elements.body.insertBefore(el, this.elements.body.firstChild);

    setTimeout(() => el.remove(), 5000);
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

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function getAnnotationStyles(): string {
  return `
    .bd-annotation-overlay {
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    .bd-annotation-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #1a1a2e;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .bd-annotation-toolbar__group {
      display: flex;
      align-items: center;
      gap: 2px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 3px;
    }

    .bd-annotation-tool-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .bd-annotation-tool-btn svg {
      width: 18px;
      height: 18px;
    }

    .bd-annotation-tool-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    .bd-annotation-tool-btn.active {
      color: #ffffff;
      background: rgba(99, 102, 241, 0.5);
      border-color: rgba(99, 102, 241, 0.8);
    }

    .bd-annotation-toolbar__colors {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
    }

    .bd-annotation-color-btn {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
      padding: 0;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }

    .bd-annotation-color-btn:hover {
      transform: scale(1.2);
      border-color: rgba(255, 255, 255, 0.5);
    }

    .bd-annotation-color-btn.active {
      border-color: #ffffff;
      transform: scale(1.15);
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
    }

    .bd-annotation-toolbar__spacer {
      flex: 1;
    }

    .bd-annotation-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .bd-annotation-action-btn svg {
      width: 18px;
      height: 18px;
    }

    .bd-annotation-action-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    .bd-annotation-toolbar__divider {
      width: 1px;
      height: 24px;
      background: rgba(255, 255, 255, 0.15);
      margin: 0 4px;
    }

    .bd-annotation-toolbar__cancel {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      background: transparent;
      color: rgba(255, 255, 255, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.15);
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
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .bd-annotation-toolbar__confirm {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 16px;
      background: #22c55e;
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
      background: #16a34a;
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
