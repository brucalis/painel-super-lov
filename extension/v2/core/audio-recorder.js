export class AudioRecorder {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;
  }

  get state() {
    return this.recorder?.state || 'inactive';
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador não disponibiliza gravação de áudio para extensões.');
    }
    if (this.recorder && this.recorder.state !== 'inactive') {
      throw new Error('Já existe uma gravação em andamento.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const mimeType = preferred.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    this.chunks = [];
    this.totalPausedMs = 0;
    this.pausedAt = null;
    this.startedAt = Date.now();
    this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    });
    this.recorder.start(500);
    return { state: this.recorder.state, mimeType: this.recorder.mimeType };
  }

  pause() {
    if (this.recorder?.state !== 'recording') return false;
    this.recorder.pause();
    this.pausedAt = Date.now();
    return true;
  }

  resume() {
    if (this.recorder?.state !== 'paused') return false;
    if (this.pausedAt) this.totalPausedMs += Date.now() - this.pausedAt;
    this.pausedAt = null;
    this.recorder.resume();
    return true;
  }

  durationMs() {
    if (!this.startedAt) return 0;
    const pausedNow = this.pausedAt ? Date.now() - this.pausedAt : 0;
    return Math.max(0, Date.now() - this.startedAt - this.totalPausedMs - pausedNow);
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        reject(new Error('Nenhuma gravação em andamento.'));
        return;
      }
      const recorder = this.recorder;
      recorder.addEventListener('stop', () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        const result = {
          blob,
          mimeType: blob.type,
          durationMs: this.durationMs(),
          size: blob.size,
          createdAt: new Date().toISOString()
        };
        this.cleanup();
        resolve(result);
      }, { once: true });
      recorder.addEventListener('error', () => {
        this.cleanup();
        reject(new Error('A gravação foi interrompida por um erro do navegador.'));
      }, { once: true });
      recorder.stop();
    });
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.chunks = [];
    this.cleanup();
  }

  cleanup() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.pausedAt = null;
    this.startedAt = null;
    this.totalPausedMs = 0;
  }
}
