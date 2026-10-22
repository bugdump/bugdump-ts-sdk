/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Panel } from './panel';

class FakeTrack {
  contentHint = '';
  stop = vi.fn();
  addEventListener = vi.fn();
  constructor(public kind: 'audio' | 'video') {}
  getSettings() {
    return { deviceId: 'mic-1' };
  }
}

class FakeMediaStream {
  constructor(private tracks: FakeTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  destinationTrack = new FakeTrack('audio');
  constructor() {
    FakeAudioContext.last = this;
  }
  createMediaStreamDestination() {
    return { stream: new FakeMediaStream([this.destinationTrack]) };
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createAnalyser() {
    return { fftSize: 0, frequencyBinCount: 32, connect: vi.fn(), getByteFrequencyData: vi.fn() };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

class FakeMediaRecorder {
  static last: FakeMediaRecorder | null = null;
  static isTypeSupported() {
    return true;
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'video/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: FakeMediaStream) {
    FakeMediaRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  // A browser fires `stop` after stop() returns, by which time the panel has turned the mic off.
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['frame']) });
    setTimeout(() => this.onstop?.(), 0);
  }
}

type PanelInternals = {
  armRecording(): Promise<void>;
  startRecording(): void;
  stopRecording(): void;
  enableMicWithDevice(deviceId: string | null): Promise<void>;
  attachments: { type: string; metadata?: Record<string, unknown> }[];
};

function createPanel(): PanelInternals {
  const host = document.createElement('div');
  document.body.append(host);
  const panel = new Panel(host.attachShadow({ mode: 'open' }), {
    screenshot: false,
    screenshotMethod: 'dom',
    screenRecording: true,
    screenRecordingMethod: 'screen-capture',
    attachments: true,
    allowTaskAttach: false,
  });
  return panel as unknown as PanelInternals;
}

async function recordingMetadata(panel: PanelInternals): Promise<Record<string, unknown> | undefined> {
  panel.stopRecording();
  await vi.waitFor(() => expect(panel.attachments).toHaveLength(1));
  return panel.attachments[0]!.metadata;
}

describe('Panel screen recording', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeMediaStream);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      // A window or a whole screen shares no audio, and neither do Firefox and Safari.
      value: {
        getDisplayMedia: vi.fn(async () => new FakeMediaStream([new FakeTrack('video')])),
        getUserMedia: vi.fn(async () => new FakeMediaStream([new FakeTrack('audio')])),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('records the mixed audio track when the shared screen brings no audio of its own', async () => {
    const panel = createPanel();

    await panel.armRecording();

    const recorded = FakeMediaRecorder.last!.stream.getAudioTracks();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toBe(FakeAudioContext.last!.destinationTrack);
  });

  it('marks a recording whose microphone was turned on while recording', async () => {
    const panel = createPanel();
    await panel.armRecording();
    panel.startRecording();

    await panel.enableMicWithDevice(null);

    expect(await recordingMetadata(panel)).toMatchObject({ micUsed: true });
  });

  it('marks a recording that started with the microphone already on', async () => {
    const panel = createPanel();
    await panel.armRecording();
    await panel.enableMicWithDevice(null);

    panel.startRecording();

    expect(await recordingMetadata(panel)).toMatchObject({ micUsed: true });
  });

  it('marks a recording made without the microphone', async () => {
    const panel = createPanel();
    await panel.armRecording();
    panel.startRecording();

    expect(await recordingMetadata(panel)).toMatchObject({ micUsed: false });
  });
});
