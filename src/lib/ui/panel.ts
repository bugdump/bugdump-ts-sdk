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
  mascotIcon,
} from './icons';
import { captureScreenshot, captureScreenshotNative } from '../capture/screenshot';
import type { ScreenshotResult } from '../capture/screenshot';
import { AnnotationOverlay, renderOperationsToCanvas } from '../capture/annotation';
import type { TextOperation } from '../capture/annotation';
import { DEFAULT_TRANSLATIONS } from '../core/config';
import type { BugdumpTranslations, CaptureMethod, ReportResponse, UserAction } from '../types';
import type { SessionReplayCollector } from '../collectors/session-replay';
import { trimReplayToBudget, SESSION_REPLAY_WINDOW_MS } from '../collectors/session-replay';
import { ReplayPacker } from '../collectors/replay-serializer';
import type { ActionCollector } from '../collectors/action';
import { getAnnotationStyles } from './panel-annotation-styles';
import { delay, loadImage, formatDuration, getSupportedMimeType } from './panel-utils';
import {
  MAX_ATTACHMENTS,
  MAX_DESCRIPTION_LENGTH,
  DEFAULT_MAX_MEDIA_SIZE,
  RECORDING_TIMESLICE_MS,
  MAX_RECORDING_DURATION_S,
  RECORDING_MAX_WIDTH,
  RECORDING_MAX_HEIGHT,
  RECORDING_MAX_FRAMERATE,
  RECORDING_VIDEO_BITRATE,
  generateAttachmentId,
} from './panel-types';
import type {
  TextAnnotationMeta,
  Attachment,
  PanelSubmitData,
  PanelFeatures,
  PanelElements,
} from './panel-types';

export type { TextAnnotationMeta, Attachment, PanelSubmitData, PanelFeatures };


export class Panel {
  private elements: PanelElements;
  private attachments: Attachment[] = [];
  private visible = false;
  private submitting = false;
  private showingSuccess = false;
  private recording = false;
  private recordingArmed = false;
  private recordingMethod: CaptureMethod = 'dom';
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private recordedSize = 0;
  private maxMediaSize = DEFAULT_MAX_MEDIA_SIZE;
  private recordingStartTime = 0;
  private recordingTimerInterval: ReturnType<typeof setInterval> | null = null;
  private reporterVisible = false;
  private taskFieldsVisible = false;
  private annotationOverlay: AnnotationOverlay | null = null;
  private annotationContainer: HTMLDivElement | null = null;
  private annotationStyleEl: HTMLStyleElement | null = null;
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private visualizerAnimFrame: number | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micEnabled = false;
  private selectedMicDeviceId: string | null = null;

  private features: PanelFeatures;
  private t: Required<BugdumpTranslations>;

  private onSubmit: ((data: PanelSubmitData) => Promise<ReportResponse>) | null = null;
  private onClose: (() => void) | null = null;
  private onMinimize: (() => void) | null = null;
  private onRecordingChange: ((isRecording: boolean) => void) | null = null;

  private dashboardUrl: string | null = null;
  private showReportLink = false;

  private sessionReplayCollector: SessionReplayCollector | null = null;
  private actionCollector: ActionCollector | null = null;
  private sessionReplayAttached = false;
  private derivedActions: UserAction[] = [];

  constructor(private shadowRoot: ShadowRoot, features?: PanelFeatures, translations?: BugdumpTranslations) {
    this.features = features ?? { screenshot: true, screenshotMethod: 'dom', screenRecording: true, screenRecordingMethod: 'dom', attachments: true, allowTaskAttach: false };
    this.t = { ...DEFAULT_TRANSLATIONS, ...translations };
    this.elements = this.createDOM();
    this.applyFeatures();
    this.bindEvents();
  }

  setOnSubmit(handler: (data: PanelSubmitData) => Promise<ReportResponse>): void {
    this.onSubmit = handler;
  }

  setOnRecordingChange(handler: (isRecording: boolean) => void): void {
    this.onRecordingChange = handler;
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

  setActionCollector(collector: ActionCollector): void {
    this.actionCollector = collector;
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

  setDashboardUrl(url: string | null | undefined): void {
    this.dashboardUrl = url ?? null;
  }

  setShowReportLink(show: boolean): void {
    this.showReportLink = show;
  }

  updateFeatures(features: Partial<PanelFeatures>): void {
    Object.assign(this.features, features);
    this.applyFeatures();
  }

  private applyFeatures(): void {
    this.elements.screenshotBtn.style.display = this.features.screenshot ? '' : 'none';
    this.elements.recordBtn.style.display = this.features.screenRecording ? '' : 'none';
    this.elements.attachBtn.style.display = this.features.attachments ? '' : 'none';
    this.elements.taskToggle.style.display = this.features.allowTaskAttach ? '' : 'none';
    if (!this.features.allowTaskAttach) {
      this.taskFieldsVisible = false;
      this.elements.taskToggle.classList.remove('bd-reporter-toggle--open');
      this.elements.taskFields.classList.remove('bd-reporter-fields--visible');
      this.elements.taskInput.value = '';
    }
  }

  show(): void {
    this.visible = true;
    this.elements.root.classList.add('bd-panel--visible');
    this.elements.textarea.focus();
  }

  /**
   * Capture the automatic session replay. Called at submit time (not on panel open) so the
   * rolling rrweb window covers the whole session up to the moment the user sends — including
   * anything that happened while the panel was open, such as a native screen recording. rrweb
   * keeps buffering continuously in the background; this just snapshots the current window.
   * Idempotent via `sessionReplayAttached` so a retried submit doesn't attach twice.
   */
  private captureSessionReplay(): void {
    if (!this.sessionReplayCollector || this.sessionReplayAttached) return;

    const events = this.sessionReplayCollector.getSessionReplay();

    this.sessionReplayAttached = true;
    // The action collector slices its own buffer by the same rolling window duration as the
    // replay — independently of rrweb's event timestamps — so the actions list survives even
    // if rrweb produced nothing or session replay is disabled. Don't clobber actions already
    // bound to a recording window by the recording stop handlers.
    if (this.derivedActions.length === 0) {
      this.derivedActions = this.actionCollector?.getRecentActions(SESSION_REPLAY_WINDOW_MS) ?? [];
    }

    if (events.length === 0) return;

    const packer = new ReplayPacker();
    const fitted = trimReplayToBudget(events, this.maxMediaSize, (slice) => packer.size(slice));
    if (fitted.length > 0) {
      const durationMs = fitted.length >= 2
        ? fitted[fitted.length - 1]!.timestamp - fitted[0]!.timestamp
        : 0;
      const durationS = Math.round(durationMs / 1000);

      this.addAttachment({
        id: generateAttachmentId(),
        type: 'session_replay',
        blob: packer.serialize(fitted),
        name: `session-replay-${Date.now()}.json`,
        durationSeconds: durationS,
      });
    } else {
      console.warn('[Bugdump] Session replay dropped: exceeds max size even after trimming. Actions list still attached.');
    }
  }

  private collectActionsForWindow(startTs: number, endTs: number): void {
    const actions = this.actionCollector?.getActionsInWindow(startTs, endTs) ?? [];
    if (actions.length > 0) {
      this.derivedActions = actions;
    }
  }

  hide({ preserveAttachments = false } = {}): void {
    this.visible = false;
    this.elements.root.classList.remove('bd-panel--visible');
    if (this.showingSuccess) {
      this.reset();
      return;
    }
    if (!preserveAttachments) {
      this.clearAttachments();
    }
    // Deliberately do NOT restart the replay collector here. It buffers continuously across
    // transient hides (e.g. hiding the panel to take a screenshot) so the session replay
    // captured at submit still spans the whole session. The collector is reset only after a
    // successful submit, in reset().
  }

  private clearAttachments(): void {
    this.revokeAttachmentUrls();
    this.attachments = [];
    this.sessionReplayAttached = false;
    this.derivedActions = [];
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

  private updateCharCounter(): void {
    const length = this.elements.textarea.value.length;
    const counter = this.elements.charCounter;
    if (length === 0) {
      counter.style.display = 'none';
      return;
    }
    counter.style.display = '';
    counter.textContent = `${length} / ${MAX_DESCRIPTION_LENGTH}`;
    counter.classList.toggle('bd-char-counter--limit', length >= MAX_DESCRIPTION_LENGTH);
  }

  reset(): void {
    this.elements.textarea.value = '';
    this.elements.textarea.style.height = '';
    this.updateCharCounter();
    this.elements.nameInput.value = '';
    this.elements.emailInput.value = '';
    this.elements.taskInput.value = '';
    this.taskFieldsVisible = false;
    this.elements.taskToggle.classList.remove('bd-reporter-toggle--open');
    this.elements.taskFields.classList.remove('bd-reporter-fields--visible');
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
    this.stopAudioVisualizer();
    this.destroyAnnotation();
    this.revokeAttachmentUrls();
    this.elements.root.remove();
  }

  private createDOM(): PanelElements {
    const root = document.createElement('div');
    root.className = 'bd-panel';
    if (this.features.screenRecordingMethod === 'dom') {
      root.classList.add('bd-panel--mode-dom');
    }

    root.innerHTML = `
      <div class="bd-panel__header">
        <div class="bd-panel__heading">
          <span class="bd-panel__mascot">${mascotIcon(28)}</span>
          <span class="bd-panel__title">${this.t.title}</span>
        </div>
        <div class="bd-panel__header-actions">
          <button class="bd-panel__minimize" aria-label="Minimize">${minimizeIcon()}</button>
          <button class="bd-panel__close" aria-label="Close">${closeIcon()}</button>
        </div>
      </div>
      <div class="bd-panel__body" data-role="body">
        <textarea class="bd-textarea" placeholder="${this.t.descriptionPlaceholder}" rows="2" maxlength="${MAX_DESCRIPTION_LENGTH}"></textarea>
        <span class="bd-char-counter" data-role="char-counter" style="display:none">0 / ${MAX_DESCRIPTION_LENGTH}</span>
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
        <button class="bd-reporter-toggle" data-action="toggle-task" style="display:none">
          ${chevronIcon()} ${this.t.taskAttachToggle}
        </button>
        <div class="bd-reporter-fields" data-role="task-fields">
          <input class="bd-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="${this.t.taskIdPlaceholder}" data-role="task-id" />
        </div>
        <input class="bd-file-input" type="file" multiple data-role="file-input" />
      </div>
      <div class="bd-recording-bar" data-role="recording-bar" style="display:none">
        <div class="bd-recording-bar__indicator"></div>
        <span class="bd-recording-bar__timer" data-role="recording-bar-timer">0:00 / 3:00</span>
        <canvas class="bd-recording-bar__canvas" data-role="recording-bar-canvas" width="80" height="28"></canvas>
        <div class="bd-recording-bar__mic-group">
          <button class="bd-recording-bar__mic" data-role="recording-bar-mic" aria-label="Toggle microphone">${micIcon()}</button>
          <button class="bd-recording-bar__mic-select" data-role="recording-bar-mic-select" aria-label="Select microphone">${chevronIcon()}</button>
        </div>
        <button class="bd-recording-bar__start" data-role="recording-bar-start">${videoIcon()} ${this.t.startRecording}</button>
        <button class="bd-recording-bar__stop" data-role="recording-bar-stop">${stopIcon()} ${this.t.stop}</button>
        <button class="bd-recording-bar__discard" data-role="recording-bar-discard">${closeIcon()} ${this.t.cancel}</button>
      </div>
      <div class="bd-success" data-role="success" style="display:none">
        ${checkCircleIcon()}
        <div class="bd-success__title">${this.t.successTitle}</div>
        <div class="bd-success__subtitle">${this.t.successSubtitle}</div>
      </div>
      <div class="bd-success-actions" data-role="success-actions" style="display:none">
        <button class="bd-success-action-btn" data-action="success-close">${this.t.closeButton}</button>
        <button class="bd-success-action-btn bd-success-action-btn--primary" data-action="success-new">${this.t.submitAnother}</button>
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
      charCounter: q<HTMLSpanElement>('[data-role="char-counter"]'),
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
      taskToggle: q<HTMLButtonElement>('[data-action="toggle-task"]'),
      taskFields: q<HTMLDivElement>('[data-role="task-fields"]'),
      taskInput: q<HTMLInputElement>('[data-role="task-id"]'),
      body: q<HTMLDivElement>('[data-role="body"]'),
      successView: q<HTMLDivElement>('[data-role="success"]'),
      successActions: q<HTMLDivElement>('[data-role="success-actions"]'),
      successCloseBtn: q<HTMLButtonElement>('[data-action="success-close"]'),
      successNewBtn: q<HTMLButtonElement>('[data-action="success-new"]'),
      recordingBar: q<HTMLDivElement>('[data-role="recording-bar"]'),
      recordingBarTimer: q<HTMLSpanElement>('[data-role="recording-bar-timer"]'),
      recordingBarCanvas: q<HTMLCanvasElement>('[data-role="recording-bar-canvas"]'),
      recordingBarStart: q<HTMLButtonElement>('[data-role="recording-bar-start"]'),
      recordingBarStop: q<HTMLButtonElement>('[data-role="recording-bar-stop"]'),
      recordingBarDiscard: q<HTMLButtonElement>('[data-role="recording-bar-discard"]'),
      recordingBarMic: q<HTMLButtonElement>('[data-role="recording-bar-mic"]'),
      recordingBarMicSelect: q<HTMLButtonElement>('[data-role="recording-bar-mic-select"]'),
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
    this.elements.taskToggle.addEventListener('click', () => this.toggleTaskFields());

    this.elements.successCloseBtn.addEventListener('click', () => this.handleClose());
    this.elements.successNewBtn.addEventListener('click', () => this.reset());

    this.elements.recordingBarStart.addEventListener('click', () => this.startRecording());
    this.elements.recordingBarStop.addEventListener('click', () => this.stopRecording());
    this.elements.recordingBarDiscard.addEventListener('click', () => this.discardRecording());
    this.elements.recordingBarMic.addEventListener('click', () => this.toggleMic());
    this.elements.recordingBarMicSelect.addEventListener('click', () => this.showMicDeviceSelector());

    this.elements.textarea.addEventListener('input', () => {
      this.autoResizeTextarea();
      this.updateCharCounter();
    });

    this.elements.textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        this.handleSubmit();
      }
    });

    this.elements.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.recording && !this.recordingArmed) {
        e.preventDefault();
        this.handleClose();
      }
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
    // A description is required unless the user attached at least one real file
    // (screenshots, recordings, voice notes, uploads) — the automatic session replay
    // does not count, since it is captured without explicit user intent.
    if (!description && this.visibleAttachments().length === 0) {
      this.showError(this.t.emptyDescriptionMessage);
      this.elements.textarea.focus();
      return;
    }

    if (this.submitting || !this.onSubmit) return;

    if (this.recording) {
      await this.stopRecordingAsync();
    } else if (this.recordingArmed) {
      this.discardRecording();
    }

    // Capture the auto session replay now — after any recording has stopped — so the rolling
    // rrweb window spans the full session up to submission, including the recording window.
    this.captureSessionReplay();

    this.setSubmitting(true);

    try {
      const taskPublicId = this.features.allowTaskAttach ? parseTaskIdInput(this.elements.taskInput.value) : null;

      const result = await this.onSubmit({
        description,
        reporterName: this.elements.nameInput.value.trim(),
        reporterEmail: this.elements.emailInput.value.trim(),
        taskPublicId,
        attachments: [...this.attachments],
        actions: [...this.derivedActions],
      });
      this.showSuccessView(String(result.taskPublicId));
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

      let result: ScreenshotResult;
      if (this.features.screenshotMethod === 'screen-capture') {
        try {
          result = await captureScreenshotNative();
        } catch (nativeErr) {
          console.warn('[Bugdump] Native screenshot failed, falling back to DOM:', nativeErr);
          result = await this.captureScreenshotDom();
        }
      } else {
        result = await this.captureScreenshotDom();
      }

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

  private captureScreenshotDom(): Promise<ScreenshotResult> {
    return captureScreenshot({
      filter: (node) => {
        if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'bugdump-widget') {
          return false;
        }
        return true;
      },
    });
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
      <div class="bd-annotation-toolbar__divider"></div>
      <div class="bd-annotation-toolbar__colors">
        <button class="bd-annotation-color-btn active" data-color="#ff0000" style="background:#ff0000" title="Red"></button>
        <button class="bd-annotation-color-btn" data-color="#ffcc00" style="background:#ffcc00" title="Yellow"></button>
        <button class="bd-annotation-color-btn" data-color="#00cc44" style="background:#00cc44" title="Green"></button>
        <button class="bd-annotation-color-btn" data-color="#0099ff" style="background:#0099ff" title="Blue"></button>
        <button class="bd-annotation-color-btn" data-color="#ffffff" style="background:#ffffff" title="White"></button>
      </div>
      <div class="bd-annotation-toolbar__divider"></div>
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
    if (this.recordingArmed) return;
    await this.armRecording();
  }

  private async armRecording(): Promise<void> {
    if (this.features.screenRecordingMethod !== 'dom') {
      const ok = await this.setupNativeRecorder();
      if (!ok) {
        // Native setup failed (permission denied / unsupported) before recording began.
        // Fall back to DOM (rrweb) recording when available; otherwise abort.
        if (this.sessionReplayCollector) {
          console.warn('[Bugdump] Native recording setup failed, falling back to DOM recording.');
          this.recordingMethod = 'dom';
          this.elements.root.classList.add('bd-panel--mode-dom');
        } else {
          return;
        }
      } else {
        this.recordingMethod = 'screen-capture';
      }
    } else {
      this.recordingMethod = 'dom';
    }
    this.recordingArmed = true;
    this.showRecordingBar();
  }

  private startRecording(): void {
    if (this.recording) return;
    if (!this.recordingArmed) return;

    if (this.recordingMethod === 'dom') {
      this.startRecordingDom();
    } else {
      this.startRecordingNative();
    }
  }

  private startRecordingDom(): void {
    if (!this.sessionReplayCollector) {
      console.warn('[Bugdump] Session replay collector not available for dom recording.');
      return;
    }

    this.sessionReplayCollector.startRecording();
    this.setRecordingState(true);
  }

  private startRecordingNative(): void {
    if (!this.mediaRecorder) return;
    this.mediaRecorder.start(RECORDING_TIMESLICE_MS);
    this.setRecordingState(true);
    // Visualizer taps the mixed destination so it shows both display + mic audio
    this.startAudioVisualizer();
  }

  private async setupNativeRecorder(): Promise<boolean> {
    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { max: RECORDING_MAX_WIDTH },
          height: { max: RECORDING_MAX_HEIGHT },
          frameRate: { max: RECORDING_MAX_FRAMERATE },
        },
        audio: true,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions);
    } catch (err) {
      console.warn('[Bugdump] Screen capture failed:', err);
      return false;
    }

    const videoTracks = this.mediaStream.getVideoTracks();
    const audioTracks = this.mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('[Bugdump] No display audio captured — user may not have shared tab audio');
    }

    // Set up a persistent AudioContext + destination for mixing audio sources.
    // Mic can be connected/disconnected at any time without rebuilding the recorder.
    this.audioContext = new AudioContext();
    this.audioDestination = this.audioContext.createMediaStreamDestination();

    for (const track of audioTracks) {
      const source = this.audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(this.audioDestination);
    }

    const videoTrack = videoTracks[0]!;
    // Hint the encoder to prioritise per-frame sharpness over motion smoothness — screen
    // recordings are mostly static UI with small text, where 'detail' keeps fonts legible.
    if ('contentHint' in videoTrack) {
      videoTrack.contentHint = 'detail';
    }
    const tracks: MediaStreamTrack[] = [videoTrack];
    if (audioTracks.length > 0) {
      const mixedAudioTrack = this.audioDestination.stream.getAudioTracks()[0]!;
      tracks.push(mixedAudioTrack);
    }
    const recordStream = new MediaStream(tracks);

    const mimeType = getSupportedMimeType();

    this.recordedChunks = [];
    this.recordedSize = 0;
    this.mediaRecorder = new MediaRecorder(recordStream, {
      mimeType,
      videoBitsPerSecond: RECORDING_VIDEO_BITRATE,
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedSize += e.data.size;

        if (this.recordedSize > this.maxMediaSize) {
          console.warn(`[Bugdump] Recording stopped: max size exceeded (${Math.round(this.maxMediaSize / 1024 / 1024)}MB)`);
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
      // Native (screen-capture) recording has no rrweb slice of its own, so bind the
      // Actions list to the rrweb events that fall within the recorded time window.
      this.collectActionsForWindow(this.recordingStartTime, recordingEndedAt);
      this.cleanupMediaStream();
      this.setRecordingState(false);
    };

    videoTrack.addEventListener('ended', () => {
      if (this.recording) {
        this.stopRecording();
      } else {
        // User stopped sharing from the browser UI before clicking in-bar Record.
        this.discardRecording();
      }
    });

    return true;
  }

  private async toggleMic(): Promise<void> {
    if (this.micEnabled) {
      this.disconnectMic();
    } else {
      await this.enableMicWithDevice(this.selectedMicDeviceId);
    }
  }

  private async enableMicWithDevice(deviceId: string | null): Promise<void> {
    this.disconnectMic();

    const audioConstraints: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId } }
      : {};
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (err) {
      console.warn('[Bugdump] Microphone access denied:', err);
      this.flashMicError();
      return;
    }

    const track = this.micStream.getAudioTracks()[0];
    if (track) {
      this.selectedMicDeviceId = track.getSettings().deviceId ?? deviceId;
    }
    this.micEnabled = true;
    this.elements.recordingBarMic.classList.add('bd-recording-bar__mic--active');

    if (this.audioContext && this.audioDestination) {
      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.audioDestination);
    }
  }

  private async showMicDeviceSelector(): Promise<void> {
    // Close existing dropdown if open
    this.closeMicDeviceDropdown();

    let devices: MediaDeviceInfo[];
    try {
      // Request temporary mic access to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'audioinput');
      tempStream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.warn('[Bugdump] Microphone access denied:', err);
      this.flashMicError();
      return;
    }

    if (devices.length === 0) return;

    // Show dropdown — append to shadow root to avoid overflow clipping
    const dropdown = document.createElement('div');
    dropdown.className = 'bd-mic-dropdown';
    dropdown.dataset.role = 'mic-dropdown';

    for (const device of devices) {
      const item = document.createElement('button');
      item.className = 'bd-mic-dropdown__item';
      if (device.deviceId === this.selectedMicDeviceId) {
        item.classList.add('bd-mic-dropdown__item--active');
      }
      item.textContent = device.label || `Microphone ${devices.indexOf(device) + 1}`;
      item.addEventListener('click', () => {
        this.closeMicDeviceDropdown();
        this.selectedMicDeviceId = device.deviceId;
        if (this.micEnabled) {
          this.enableMicWithDevice(device.deviceId).catch(() => {});
        }
      });
      dropdown.appendChild(item);
    }

    // Position above the mic group
    const btnRect = this.elements.recordingBarMicSelect.getBoundingClientRect();
    const hostRect = this.shadowRoot.host.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.bottom = `${window.innerHeight - btnRect.top + 6}px`;
    dropdown.style.left = `${btnRect.left + btnRect.width / 2 - hostRect.left}px`;
    dropdown.style.transform = 'translateX(-50%)';

    this.shadowRoot.appendChild(dropdown);

    // Close on outside click (listen on both document and shadow root)
    const closeHandler = (e: Event) => {
      const target = e.target as Node;
      if (!dropdown.contains(target) && !this.elements.recordingBarMicSelect.contains(target)) {
        this.closeMicDeviceDropdown();
        document.removeEventListener('click', closeHandler);
        this.shadowRoot.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
      this.shadowRoot.addEventListener('click', closeHandler);
    }, 0);
  }

  private closeMicDeviceDropdown(): void {
    const existing = this.shadowRoot.querySelector('[data-role="mic-dropdown"]');
    if (existing) existing.remove();
  }

  private disconnectMic(): void {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.micEnabled = false;
    this.elements.recordingBarMic.classList.remove('bd-recording-bar__mic--active');
  }

  private flashMicError(): void {
    const btn = this.elements.recordingBarMic;
    btn.classList.add('bd-recording-bar__mic--error');
    setTimeout(() => btn.classList.remove('bd-recording-bar__mic--error'), 1500);
  }

  private stopRecording(): void {
    if (this.recordingMethod === 'dom') {
      this.stopRecordingDom();
    } else {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      this.cleanupMediaStream();
    }
  }

  private stopRecordingAsync(): Promise<void> {
    if (this.recordingMethod === 'dom') {
      this.stopRecordingDom();
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanupMediaStream();
        this.setRecordingState(false);
        resolve();
        return;
      }

      const originalOnStop = this.mediaRecorder.onstop;
      this.mediaRecorder.onstop = (event) => {
        if (originalOnStop) {
          (originalOnStop as (ev: Event) => void).call(this.mediaRecorder, event);
        }
        resolve();
      };

      this.mediaRecorder.stop();
    });
  }

  private stopRecordingDom(): void {
    if (!this.sessionReplayCollector) {
      this.setRecordingState(false);
      return;
    }

    const recordingEvents = this.sessionReplayCollector.stopRecording();

    if (recordingEvents.length > 0) {
      // Bind the Actions list to the recorded window so actions, video, and replay all
      // cover the same span (instead of the rolling window from when the panel opened).
      // The action collector slices by the panel's own Record/Stop timestamps — no rrweb
      // event times — so the two stay decoupled.
      this.derivedActions = this.actionCollector?.getActionsInWindow(this.recordingStartTime, Date.now()) ?? [];

      const packer = new ReplayPacker();
      const fitted = trimReplayToBudget(recordingEvents, this.maxMediaSize, (slice) => packer.size(slice));
      if (fitted.length > 0) {
        const firstTs = fitted[0]!.timestamp;
        const lastTs = fitted[fitted.length - 1]!.timestamp;
        this.addAttachment({
          id: generateAttachmentId(),
          type: 'recording',
          blob: packer.serialize(fitted),
          name: `recording-${Date.now()}.json`,
          metadata: {
            recordingStartedAt: firstTs,
            recordingEndedAt: lastTs,
            durationMs: lastTs - firstTs,
          },
        });
      } else {
        console.warn('[Bugdump] Recording replay dropped: exceeds max size even after trimming. Actions list still attached.');
      }
    }

    this.setRecordingState(false);
  }

  private cleanupMediaStream(): void {
    this.disconnectMic();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    this.audioDestination = null;
  }

  private setRecordingState(isRecording: boolean): void {
    if (this.recording !== isRecording) {
      this.onRecordingChange?.(isRecording);
    }
    this.recording = isRecording;
    if (isRecording) {
      this.recordingStartTime = Date.now();
      this.elements.root.classList.add('bd-panel--recording-active');
      this.updateRecordingBarTimer();
      this.recordingTimerInterval = setInterval(() => this.updateRecordingBarTimer(), 1000);
    } else {
      if (this.recordingTimerInterval) {
        clearInterval(this.recordingTimerInterval);
        this.recordingTimerInterval = null;
      }
      this.stopAudioVisualizer();
      this.recordingArmed = false;
      this.elements.recordingBarMic.classList.remove('bd-recording-bar__mic--active');
      this.resetRecordingBarTimer();
      this.hideRecordingBar();
      this.elements.recordBtn.innerHTML = `${videoIcon()} ${this.t.recordButton}`;
      this.elements.recordBtn.style.color = '';
    }
  }

  private showRecordingBar(): void {
    const header = this.elements.root.querySelector<HTMLElement>('.bd-panel__header');
    const footer = this.elements.root.querySelector<HTMLElement>('.bd-panel__footer');
    if (header) header.style.display = 'none';
    this.elements.body.style.display = 'none';
    if (footer) footer.style.display = 'none';
    this.elements.successView.style.display = 'none';
    this.elements.recordingBar.style.display = 'flex';
    this.elements.root.classList.add('bd-panel--recording');
  }

  private hideRecordingBar(): void {
    this.elements.recordingBar.style.display = 'none';
    this.elements.root.classList.remove('bd-panel--recording');
    this.elements.root.classList.remove('bd-panel--recording-active');
    const header = this.elements.root.querySelector<HTMLElement>('.bd-panel__header');
    const footer = this.elements.root.querySelector<HTMLElement>('.bd-panel__footer');
    if (header) header.style.display = '';
    this.elements.body.style.display = '';
    if (footer) footer.style.display = '';
  }

  private discardRecording(): void {
    if (this.recordingMethod === 'dom') {
      if (this.recording && this.sessionReplayCollector) {
        this.sessionReplayCollector.stopRecording();
      }
    } else {
      if (this.mediaRecorder) {
        if (this.mediaRecorder.state !== 'inactive') {
          // Clear onstop so it doesn't add the attachment
          this.mediaRecorder.onstop = null;
          this.mediaRecorder.stop();
        }
        this.mediaRecorder = null;
      }
      this.cleanupMediaStream();
    }
    this.recordedChunks = [];
    this.recordedSize = 0;
    this.setRecordingState(false);
  }

  private resetRecordingBarTimer(): void {
    const maxMin = Math.floor(MAX_RECORDING_DURATION_S / 60);
    const maxSec = MAX_RECORDING_DURATION_S % 60;
    const limit = `${maxMin}:${String(maxSec).padStart(2, '0')}`;
    this.elements.recordingBarTimer.textContent = `0:00 / ${limit}`;
  }

  private updateRecordingBarTimer(): void {
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
    this.elements.recordingBarTimer.textContent = `${elapsed} / ${limit}`;
  }

  private startAudioVisualizer(): void {
    if (!this.audioContext || !this.audioDestination) return;

    try {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      // Tap the mixed destination stream to visualize all audio sources
      const source = this.audioContext.createMediaStreamSource(this.audioDestination.stream);
      source.connect(this.analyser);
      this.drawVisualizer();
    } catch {
      // AudioContext not supported — canvas stays blank
    }
  }

  private drawVisualizer(): void {
    if (!this.analyser) return;

    const canvas = this.elements.recordingBarCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 12;
    const barWidth = 3;
    const gap = (canvas.width - barCount * barWidth) / (barCount + 1);
    const maxBarHeight = canvas.height - 4;

    const draw = () => {
      this.visualizerAnimFrame = requestAnimationFrame(draw);
      this.analyser!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex]! / 255;
        const barHeight = Math.max(2, value * maxBarHeight);
        const x = gap + i * (barWidth + gap);
        const y = (canvas.height - barHeight) / 2;

        ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + value * 0.6})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1.5);
        ctx.fill();
      }
    };

    draw();
  }

  private stopAudioVisualizer(): void {
    if (this.visualizerAnimFrame != null) {
      cancelAnimationFrame(this.visualizerAnimFrame);
      this.visualizerAnimFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }
    const ctx = this.elements.recordingBarCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, this.elements.recordingBarCanvas.width, this.elements.recordingBarCanvas.height);
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

  private visibleAttachments(): Attachment[] {
    return this.attachments.filter((a) => a.type !== 'session_replay');
  }

  private addAttachment(attachment: Attachment): void {
    if (this.visibleAttachments().length >= MAX_ATTACHMENTS) return;
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

    const visible = this.visibleAttachments();
    if (visible.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    for (const att of visible) {
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

  private toggleTaskFields(): void {
    this.taskFieldsVisible = !this.taskFieldsVisible;
    this.elements.taskToggle.classList.toggle('bd-reporter-toggle--open', this.taskFieldsVisible);
    this.elements.taskFields.classList.toggle('bd-reporter-fields--visible', this.taskFieldsVisible);
    if (this.taskFieldsVisible) {
      this.elements.taskInput.focus();
    }
  }

  setUploadProgress(current: number, total: number, filePercent: number): void {
    if (total === 0) return;
    const overallPercent = Math.round(((current - 1 + filePercent / 100) / total) * 100);
    this.setSendBtnLabel(`Uploading ${current}/${total}… ${overallPercent}%`);
  }

  private setSendBtnLabel(label: string): void {
    let labelEl = this.elements.sendBtn.querySelector<HTMLSpanElement>('.bd-send-btn__label');
    if (!labelEl) {
      this.elements.sendBtn.innerHTML = `<span class="bd-spinner"></span> <span class="bd-send-btn__label"></span>`;
      labelEl = this.elements.sendBtn.querySelector<HTMLSpanElement>('.bd-send-btn__label')!;
    }
    labelEl.textContent = label;
  }

  private setSubmitting(submitting: boolean): void {
    this.submitting = submitting;
    this.elements.sendBtn.disabled = submitting;
    if (submitting) {
      this.setSendBtnLabel(this.t.sending);
    } else {
      this.elements.sendBtn.innerHTML = `${sendIcon()} ${this.t.sendButton}`;
    }
  }

  private showSuccessView(reportId?: string): void {
    this.showingSuccess = true;
    this.elements.body.style.display = 'none';
    this.elements.successView.style.display = 'flex';
    this.elements.successActions.style.display = 'flex';
    const footer = this.elements.root.querySelector<HTMLDivElement>('.bd-panel__footer')!;
    footer.style.display = 'none';

    const existingLink = this.elements.successView.querySelector('.bd-success__link-row');
    if (existingLink) existingLink.remove();

    if (!this.showReportLink || !this.dashboardUrl || !reportId) return;

    const reportUrl = `${this.dashboardUrl}/${reportId}`;
    const row = document.createElement('div');
    row.className = 'bd-success__link-row';

    const link = document.createElement('a');
    link.href = reportUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'bd-success__link';
    link.textContent = reportUrl;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'bd-success__copy-btn';
    copyBtn.textContent = this.t.copyLink;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(reportUrl).then(() => {
        copyBtn.textContent = this.t.copied;
        setTimeout(() => {
          copyBtn.textContent = this.t.copyLink;
        }, 2000);
      });
    });

    row.appendChild(link);
    row.appendChild(copyBtn);
    this.elements.successView.appendChild(row);
  }

  private showFormView(): void {
    this.showingSuccess = false;
    this.elements.body.style.display = 'flex';
    this.elements.successView.style.display = 'none';
    this.elements.successActions.style.display = 'none';
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

function parseTaskIdInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isInteger(n) && n > 0 ? n : null;
}

