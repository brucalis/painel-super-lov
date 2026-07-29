// attachment-manager.js — amplia o sistema de anexos EXISTENTE (window.LCA.Attachment).
// Não substitui o fluxo de upload em 3 etapas já validado: apenas adiciona
// validação, preview, estados, cancelar e tentar novamente por cima dele.
(function () {
  const ACCEPTED = [
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf', 'text/plain', 'text/markdown', 'application/json', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav',
    'audio/webm', 'audio/ogg', 'audio/aac',
  ];
  const EXT_FALLBACK = /\.(png|jpe?g|webp|gif|svg|pdf|txt|md|json|csv|zip|mp3|m4a|wav|webm|ogg|aac)$/i;

  function isAudio(file) {
    return (file.type || '').startsWith('audio/') || /\.(mp3|m4a|wav|webm|ogg|aac)$/i.test(file.name);
  }

  function iconFor(file) {
    const t = file.type || '';
    if (t.startsWith('image/')) return '🖼️';
    if (isAudio(file)) return '🎧';
    if (t === 'application/pdf') return '📕';
    if (t.includes('zip')) return '🗜️';
    if (t === 'application/json') return '🧾';
    if (t === 'text/csv') return '📊';
    if (t.startsWith('text/')) return '📄';
    return '📎';
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function validate(file) {
    const s = window.SettingsManager.all;
    const list = window.LCA.attachments;
    const typeOk = ACCEPTED.includes(file.type) || EXT_FALLBACK.test(file.name);
    if (!typeOk) return `${window.I18n.t('err_file')} (tipo não suportado: ${file.type || 'desconhecido'})`;
    if (file.size > s.maxFileMb * 1024 * 1024) return `${window.I18n.t('err_file')} (limite de ${s.maxFileMb} MB por arquivo)`;
    if (list.length >= s.maxFiles) return `Máximo de ${s.maxFiles} arquivos por envio.`;
    const total = list.reduce((a, x) => a + x.file.size, 0) + file.size;
    if (total > s.maxTotalMb * 1024 * 1024) return `Limite total de ${s.maxTotalMb} MB excedido.`;
    if (list.some((x) => x.file.name === file.name && x.file.size === file.size)) {
      return `Arquivo duplicado: ${file.name}`;
    }
    return null;
  }

  // ----- Backup lógico do render original antes de estender -----
  let baseRender = null;

  function enhance() {
    const A = window.LCA.Attachment;
    if (!A || A.__enhanced) return;
    baseRender = A.prototype.render;
    A.__enhanced = true;
    A.prototype.__baseRender = baseRender;

    A.prototype.render = function () {
      const first = !this.el;
      baseRender.call(this); // preserva a marcação original
      if (first) {
        this.el.classList.add('rich');
        const head = document.createElement('div');
        head.className = 'chip-head';
        this.el.prepend(head);
        this.headEl = head;
        const actions = document.createElement('div');
        actions.className = 'chip-actions';
        this.el.appendChild(actions);
        this.actionsEl = actions;
        if ((this.file.type || '').startsWith('image/')) {
          const img = document.createElement('img');
          img.className = 'thumb';
          img.alt = this.file.name;
          img.src = URL.createObjectURL(this.file);
          head.appendChild(img);
        } else {
          const icon = document.createElement('span');
          icon.className = 'chip-icon';
          icon.textContent = iconFor(this.file);
          head.appendChild(icon);
        }
        if (isAudio(this.file)) buildPlayer(this);
      }
      const size = this.el.querySelector('.chip-size') || document.createElement('span');
      size.className = 'chip-size';
      size.textContent = fmtSize(this.file.size);
      if (!size.parentNode) this.el.appendChild(size);
      renderActions(this);
      return this.el;
    };
  }

  function renderActions(att) {
    if (!att.actionsEl) return;
    att.actionsEl.innerHTML = '';
    const mk = (label, title, fn) => {
      const b = document.createElement('button');
      b.className = 'chip-btn';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      att.actionsEl.appendChild(b);
    };
    if (att.status === 'uploading') mk('■', 'Cancelar upload', () => AttachmentManager.cancel(att));
    if (att.status === 'error' || att.status === 'cancelled') {
      mk('↻', 'Tentar novamente', () => AttachmentManager.retry(att));
    }
    if (isAudio(att.file)) {
      mk('✎', 'Renomear', () => AttachmentManager.rename(att));
      mk('T', 'Transcrever áudio', () => AttachmentManager.transcribe(att));
    }
  }

  function buildPlayer(att) {
    const wrap = document.createElement('div');
    wrap.className = 'audio-player';
    const audio = new Audio(URL.createObjectURL(att.file));
    audio.preload = 'metadata';
    wrap.innerHTML = `
      <button class="chip-btn play" aria-label="Reproduzir">▶</button>
      <input class="seek" type="range" min="0" max="100" value="0" aria-label="Progresso do áudio" />
      <span class="time">0:00</span>
      <input class="vol" type="range" min="0" max="100" value="100" aria-label="Volume" />`;
    const play = wrap.querySelector('.play');
    const seek = wrap.querySelector('.seek');
    const time = wrap.querySelector('.time');
    const vol = wrap.querySelector('.vol');
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    play.addEventListener('click', () => {
      if (audio.paused) { audio.play().catch(() => {}); play.textContent = '❚❚'; }
      else { audio.pause(); play.textContent = '▶'; }
    });
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) seek.value = String((audio.currentTime / audio.duration) * 100);
      time.textContent = fmt(audio.currentTime);
    });
    audio.addEventListener('ended', () => { play.textContent = '▶'; });
    seek.addEventListener('input', () => {
      if (audio.duration) audio.currentTime = (Number(seek.value) / 100) * audio.duration;
    });
    vol.addEventListener('input', () => { audio.volume = Number(vol.value) / 100; });
    att.audioEl = audio;
    att.el.appendChild(wrap);
  }

  const AttachmentManager = {
    ACCEPTED,
    isAudio,
    validate,
    fmtSize,
    enhance,
    add(file) {
      const err = validate(file);
      if (err) {
        window.LCA.setStatus(err, 'error', 6000);
        window.NotificationManager.play('error');
        return null;
      }
      const att = window.LCA.addAttachment(file);
      return att || null;
    },
    cancel(att) {
      att.cancelled = true;
      att.status = 'cancelled';
      att.progress = 0;
      try { att.xhr?.abort(); } catch (e) { /* noop */ }
      att.render();
      window.LCA.setStatus('Upload cancelado.', 'info');
    },
    async retry(att) {
      att.cancelled = false;
      att.status = 'pending';
      att.progress = 0;
      att.render();
      try {
        await att.upload(); // reutiliza o fluxo original de 3 etapas
        window.NotificationManager.play('uploadDone');
      } catch (e) {
        att.status = 'error';
        att.render();
        window.LCA.setStatus(e.message, 'error', 6000);
      }
    },
    rename(att) {
      const name = window.prompt('Novo nome do arquivo:', att.file.name);
      if (!name) return;
      try {
        att.file = new File([att.file], name, { type: att.file.type });
        att.render();
      } catch (e) {
        window.LCA.setStatus('Não foi possível renomear o arquivo.', 'error');
      }
    },
    /** Interface abstrata; nenhum áudio sai da máquina sem endpoint configurado. */
    transcriptionProvider: {
      async transcribe(audioFile) {
        const endpoint = window.SettingsManager.get('transcriptionEndpoint');
        if (!endpoint) throw new Error(window.I18n.t('transcribe_missing'));
        if (!window.confirm(`Enviar "${audioFile.name}" para ${endpoint} para transcrição?`)) {
          throw new Error('Transcrição cancelada pelo usuário.');
        }
        const fd = new FormData();
        fd.append('file', audioFile);
        const res = await fetch(endpoint, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`Transcrição falhou: ${res.status}`);
        const data = await res.json().catch(() => ({}));
        return data.text || data.transcript || '';
      },
    },
    async transcribe(att) {
      try {
        window.LCA.setStatus('Transcrevendo áudio…', 'info', 8000);
        const text = await AttachmentManager.transcriptionProvider.transcribe(att.file);
        if (!text) throw new Error(window.I18n.t('transcribe_missing'));
        const input = window.LCA.els.input;
        input.value = `${input.value}\n${text}`.trim();
        window.LCA.setStatus('Transcrição adicionada ao prompt.', 'success');
      } catch (e) {
        window.LCA.setStatus(e.message, 'error', 7000);
      }
    },
    /** Liga arrastar-e-soltar e colar imagem. */
    bindDropAndPaste(zone) {
      ['dragenter', 'dragover'].forEach((ev) =>
        zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('dragging'); })
      );
      ['dragleave', 'drop'].forEach((ev) =>
        zone.addEventListener(ev, () => zone.classList.remove('dragging'))
      );
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        Array.from(e.dataTransfer?.files || []).forEach((f) => AttachmentManager.add(f));
      });
      document.addEventListener('paste', (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        items.filter((i) => i.kind === 'file').forEach((i) => {
          const f = i.getAsFile();
          if (f) AttachmentManager.add(f);
        });
      });
    },
  };

  window.AttachmentManager = AttachmentManager;
})();
