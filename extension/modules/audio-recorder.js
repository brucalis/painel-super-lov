// audio-recorder.js — gravação de voz via MediaRecorder (nunca inicia sozinha)
(function () {
  let recorder = null;
  let chunks = [];
  let stream = null;
  let startedAt = 0;
  let elapsed = 0;
  let timer = null;
  let state = 'idle'; // idle | permission | recording | paused | processing | ready | error
  const listeners = [];

  function emit(extra = {}) {
    listeners.forEach((fn) => {
      try { fn({ state, seconds: Math.floor(elapsed / 1000), ...extra }); } catch (e) { console.warn(e); }
    });
  }

  function tick() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (state === 'recording') {
        elapsed += 250;
        emit();
      }
    }, 250);
  }

  function pickMime() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
    return candidates.find((c) => window.MediaRecorder?.isTypeSupported?.(c)) || '';
  }

  function cleanup() {
    clearInterval(timer);
    timer = null;
    try { stream?.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
    stream = null;
    recorder = null;
  }

  const AudioRecorder = {
    get state() { return state; },
    onChange(fn) { listeners.push(fn); },
    async start() {
      if (state === 'recording' || state === 'paused') return;
      try {
        state = 'permission';
        emit();
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = pickMime();
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunks = [];
        elapsed = 0;
        startedAt = Date.now();
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onerror = () => { state = 'error'; emit({ error: window.I18n.t('err_generic') }); };
        recorder.start(250);
        state = 'recording';
        tick();
        emit();
      } catch (e) {
        cleanup();
        state = 'error';
        const denied = e && /denied|not allowed|dismissed/i.test(`${e.name} ${e.message}`);
        const msg = denied
          ? 'O Chrome não autorizou o uso do microfone. Clique no ícone de permissões do navegador e permita o acesso para a SUPER LOVABLE.'
          : `Microfone indisponível: ${e.message}`;
        emit({ error: msg, denied });
        throw new Error(msg);
      }
    },
    pause() {
      if (state !== 'recording' || !recorder) return;
      try { recorder.pause(); state = 'paused'; emit(); } catch (e) { console.warn(e); }
    },
    resume() {
      if (state !== 'paused' || !recorder) return;
      try { recorder.resume(); state = 'recording'; emit(); } catch (e) { console.warn(e); }
    },
    /** Finaliza e devolve um File pronto para o fluxo normal de anexos. */
    stop() {
      return new Promise((resolve, reject) => {
        if (!recorder) return reject(new Error('Nenhuma gravação em andamento.'));
        state = 'processing';
        emit();
        recorder.onstop = () => {
          try {
            const type = recorder?.mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type });
            const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
            const stamp = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const name = `gravacao-super-lovable-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}-${pad(stamp.getMinutes())}.${ext}`;
            const file = new File([blob], name, { type, lastModified: Date.now() });
            file.superLovableDurationMs = elapsed;
            cleanup();
            state = 'ready';
            emit();
            resolve(file);
          } catch (e) {
            cleanup();
            state = 'error';
            emit({ error: e.message });
            reject(e);
          }
        };
        try { recorder.stop(); } catch (e) { cleanup(); state = 'error'; emit({ error: e.message }); reject(e); }
      });
    },
    cancel() {
      try { recorder?.stop(); } catch (e) { /* noop */ }
      cleanup();
      chunks = [];
      state = 'idle';
      emit();
    },
  };

  window.AudioRecorder = AudioRecorder;
})();
