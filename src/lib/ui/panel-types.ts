import type { CaptureMethod } from '../types';

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
  taskPublicId: number | null;
  attachments: Attachment[];
}

export interface PanelFeatures {
  screenshot: boolean;
  screenshotMethod: CaptureMethod;
  screenRecording: boolean;
  screenRecordingMethod: CaptureMethod;
  attachments: boolean;
  allowTaskAttach: boolean;
}

export interface PanelElements {
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
  taskToggle: HTMLButtonElement;
  taskFields: HTMLDivElement;
  taskInput: HTMLInputElement;
  body: HTMLDivElement;
  successView: HTMLDivElement;
  successActions: HTMLDivElement;
  successCloseBtn: HTMLButtonElement;
  successNewBtn: HTMLButtonElement;
  recordingBar: HTMLDivElement;
  recordingBarTimer: HTMLSpanElement;
  recordingBarCanvas: HTMLCanvasElement;
  recordingBarStart: HTMLButtonElement;
  recordingBarStop: HTMLButtonElement;
  recordingBarDiscard: HTMLButtonElement;
  recordingBarMic: HTMLButtonElement;
  recordingBarMicSelect: HTMLButtonElement;
}

export const MAX_ATTACHMENTS = 10;
export const DEFAULT_MAX_MEDIA_SIZE = 50 * 1024 * 1024; // 50MB fallback
export const RECORDING_TIMESLICE_MS = 1000;
export const MAX_RECORDING_DURATION_S = 180; // 3 minutes

let attachmentIdCounter = 0;

export function generateAttachmentId(): string {
  return `att_${Date.now()}_${++attachmentIdCounter}`;
}
