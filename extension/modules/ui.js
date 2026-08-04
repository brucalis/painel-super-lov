// ui.js — orquestra os novos módulos sobre a interface existente.
// Não altera autenticação, montagem de body, IDs ou o endpoint de chat.
(function () {
  const $ = (id) => document.getElementById(id);
  let selectedShortcut = null;

  // ---------------- Barra de status estendida ----------------
  const StatusBar = {
    el: null,
    set(key, kind = 'info', { sticky = false, detail = '', onRetry = null } = {}) {
      if (!StatusBar.el) return;
      StatusBar.el.className = `statusbar ${kind}`;
      StatusBar.el.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = key;
      StatusBar.el.appendChild(label);
      if (detail) {
        const b = document.createElement('button');
        b.className = 'sb-btn';
        b.textContent = window.I18n.t('details');
        b.addEventListener('click', () => window.alert(detail));
        StatusBar.el.appendChild(b);
      }
      if (onRetry) {
        const b = document.createElement('button');
        b.className = 'sb-btn';
        b.textContent = window.I18n.t('retry');
        b.addEventListener('click', onRetry);
        StatusBar.el.appendChild(b);
      }
      clearTimeout(StatusBar._t);
      if (!sticky && kind !== 'error') {
        StatusBar._t = setTimeout(() => StatusBar.set(baseStatus(), 'idle'), 4000);
      }
    },
  };

  function baseStatus() {
    if (!window.LCA.authToken) return window.I18n.t('st_nosession');
    if (!window.LCA.projectId) return window.I18n.t('st_noproject');
    return window.I18n.t('st_synced');
  }

  // ---------------- Abas ----------------
  function initTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-selected', String(t === tab));
        });
        document.querySelectorAll('.panel').forEach((p) => {
          p.classList.toggle('active', p.id === `panel-${tab.dataset.tab}`);
        });
        if (tab.dataset.tab === 'queue') renderQueue();
        if (tab.dataset.tab === 'history') renderHistory();
      });
    });
  }

  // ---------------- Modelo (removido na v1.7.0) ----------------
  async function initModel() {
    // A lógica interna de seleção automática é preservada, mas a interface foi removida a pedido.
    window.LCA_selectedModel = window.SettingsManager.get('defaultModel') || 'auto';
  }


  // ---------------- Atalhos rápidos ----------------
  function renderShortcuts() {
    const wrap = $('quickActions');
    wrap.innerHTML = '';
    window.QuickActions.items.forEach((it) => {
      const b = document.createElement('button');
      b.className = `qa${selectedShortcut === it.id ? ' active' : ''}`;
      b.textContent = it.label;
      b.setAttribute('aria-label', `Atalho ${it.label}`);
      b.addEventListener('click', () => {
        const input = window.LCA.els.input;
        if (selectedShortcut === it.id) {
          selectedShortcut = null;
          input.value = input.value.replace(it.text, '').trim();
        } else {
          selectedShortcut = it.id;
          input.value = input.value ? `${input.value}\n\n${it.text}` : it.text;
        }
        input.focus();
        renderShortcuts();
      });
      wrap.appendChild(b);
    });
  }

  function renderShortcutEditor() {
    const wrap = $('shortcutEditor');
    if (!wrap) return;
    wrap.innerHTML = '';
    window.QuickActions.items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'sc-row';
      row.innerHTML = `<span class="sc-name">${it.label}</span>`;
      const mk = (t, title, fn) => {
        const b = document.createElement('button');
        b.className = 'chip-btn';
        b.textContent = t;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', fn);
        row.appendChild(b);
      };
      mk('↑', 'Mover para cima', async () => { await window.QuickActions.move(it.id, -1); renderShortcuts(); renderShortcutEditor(); });
      mk('↓', 'Mover para baixo', async () => { await window.QuickActions.move(it.id, 1); renderShortcuts(); renderShortcutEditor(); });
      mk('✎', 'Editar', async () => {
        const label = window.prompt('Nome do atalho:', it.label);
        if (label === null) return;
        const text = window.prompt('Texto do atalho:', it.text);
        if (text === null) return;
        await window.QuickActions.update(it.id, { label, text });
        renderShortcuts(); renderShortcutEditor();
      });
      mk('⧉', 'Duplicar', async () => { await window.QuickActions.duplicate(it.id); renderShortcuts(); renderShortcutEditor(); });
      mk('🗑', 'Excluir', async () => {
        if (!window.ShieldManager.confirmDestructive(`Excluir o atalho "${it.label}"?`)) return;
        await window.QuickActions.remove(it.id);
        renderShortcuts(); renderShortcutEditor();
      });
      wrap.appendChild(row);
      void idx;
    });
  }

  // ---------------- Fila ----------------
  /** Fala com o motor único da fila no service worker. */
  function queueCall(action, data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action, data: data || {} }, (r) => {
        void chrome.runtime.lastError;
        resolve(r || { success: false });
      });
    });
  }

  const QUEUE_LABEL = {
    pending: 'aguardando envio manual',
    queued: 'na fila', preparing: 'preparando', sending: 'enviando', running: 'executando',
    completed: 'concluído', failed: 'falhou', cancelled: 'cancelado', paused: 'pausado',
  };

  async function renderQueue() {
    const wrap = $('queueList');
    const snap = await queueCall('SUPER_LOVABLE_QUEUE_SNAPSHOT');
    const items = (snap && snap.items) || [];
    const summary = (snap && snap.summary) || { total: 0, max: 10, paused: false };
    wrap.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'q-toolbar';
    bar.innerHTML = `<span class="muted">${summary.total}/${summary.max} comandos${summary.paused ? ' · pausada' : ''}</span>`;
    const mkTop = (t, title, fn) => {
      const b = document.createElement('button');
      b.className = 'chip-btn';
      b.textContent = t;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      bar.appendChild(b);
    };
    mkTop(summary.paused ? 'Retomar' : 'Pausar', 'Pausar ou retomar a fila', async () => {
      await queueCall(summary.paused ? 'SUPER_LOVABLE_QUEUE_RESUME' : 'SUPER_LOVABLE_QUEUE_PAUSE');
      renderQueue();
    });
    if (summary.needsConfirmation) {
      mkTop('Confirmar conclusão', 'Confirmar que a Lovable terminou', async () => {
        await queueCall('SUPER_LOVABLE_QUEUE_CONFIRM');
        renderQueue();
      });
      mkTop('Continuar aguardando', 'Seguir esperando a Lovable', async () => {
        await queueCall('SUPER_LOVABLE_QUEUE_KEEP_WAITING');
        renderQueue();
      });
    }
    mkTop('Limpar concluídos', 'Remover itens concluídos', async () => {
      await queueCall('SUPER_LOVABLE_QUEUE_CLEAR_DONE');
      renderQueue();
    });
    mkTop('Limpar tudo', 'Esvaziar a fila', async () => {
      if (!window.ShieldManager.confirmDestructive('Remover todos os itens da fila?')) return;
      await queueCall('SUPER_LOVABLE_QUEUE_CLEAR_ALL');
      renderQueue();
    });
    wrap.appendChild(bar);

    if (summary.needsConfirmation) {
      const note = document.createElement('p');
      note.className = 'q-error';
      note.textContent = summary.needsConfirmation;
      wrap.appendChild(note);
    }
    if (summary.projectConflict) {
      const note = document.createElement('p');
      note.className = 'q-error';
      note.textContent = summary.projectConflict;
      wrap.appendChild(note);
    }

    if (!items.length) {
      wrap.insertAdjacentHTML('beforeend', '<p class="muted">A fila está vazia. Envie um prompt e ele aparece aqui.</p>');
      return;
    }

    items.forEach((it, index) => {
      const row = document.createElement('div');
      row.className = `q-item status-${it.status}`;
      row.draggable = true;
      const names = (it.attachments || []).map((a) => a && a.name).filter(Boolean);
      row.innerHTML = `
        <div class="q-head"><b>#${it.position || index + 1}</b> <span class="q-status">${QUEUE_LABEL[it.status] || it.status}</span></div>
        <div class="q-text"></div>
        ${names.length ? `<div class="q-files">📎 ${names.join(', ')}</div>` : ''}
        ${it.lastError ? `<div class="q-error">${it.lastError}</div>` : ''}
        <div class="q-actions"></div>`;
      row.querySelector('.q-text').textContent = it.text || '(sem texto)';
      const acts = row.querySelector('.q-actions');
      const mk = (t, title, fn) => {
        const b = document.createElement('button');
        b.className = 'chip-btn';
        b.textContent = t;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', fn);
        acts.appendChild(b);
      };
      if (it.status === 'pending') {
        mk('➤ Enviar agora', 'Enviar este prompt imediatamente', async () => {
          const r = await queueCall('SUPER_LOVABLE_QUEUE_SEND_NOW', { id: it.id });
          if (r && r.error) window.LCA.setStatus(r.error, 'error', 6000);
          renderQueue();
        });
        mk('⚡', 'Passar para envio automático', async () => {
          await queueCall('SUPER_LOVABLE_QUEUE_SET_MODE', { id: it.id, mode: 'auto' });
          renderQueue();
        });
      } else if (it.status === 'queued') {
        mk('⏸ Deixar pendente', 'Segurar este prompt para editar e enviar manualmente', async () => {
          await queueCall('SUPER_LOVABLE_QUEUE_SET_MODE', { id: it.id, mode: 'pending' });
          renderQueue();
        });
      }
      mk('▲', 'Mover para o topo', async () => { await queueCall('SUPER_LOVABLE_QUEUE_MOVE', { id: it.id, index: 0 }); renderQueue(); });
      mk('✎', 'Editar', async () => {
        const text = window.prompt('Editar prompt:', it.text);
        if (text === null) return;
        await queueCall('SUPER_LOVABLE_QUEUE_EDIT', { id: it.id, text });
        renderQueue();
      });
      mk('⧉', 'Duplicar', async () => { await queueCall('SUPER_LOVABLE_QUEUE_DUPLICATE', { id: it.id }); renderQueue(); });
      if (it.status === 'failed') {
        mk('↻', 'Tentar novamente', async () => { await queueCall('SUPER_LOVABLE_QUEUE_RETRY', { id: it.id }); renderQueue(); });
        mk('⏭', 'Pular este item', async () => { await queueCall('SUPER_LOVABLE_QUEUE_SKIP', { id: it.id }); renderQueue(); });
      }
      mk('🗑', 'Remover', async () => {
        if (!window.ShieldManager.confirmDestructive('Remover este item da fila?')) return;
        await queueCall('SUPER_LOVABLE_QUEUE_REMOVE', { id: it.id });
        renderQueue();
      });
      row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', it.id));
      row.addEventListener('dragover', (e) => e.preventDefault());
      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id && id !== it.id) { await queueCall('SUPER_LOVABLE_QUEUE_MOVE', { id, index }); renderQueue(); }
      });
      wrap.appendChild(row);
    });
  }

  // Atualização viva: o motor avisa sempre que a fila muda.
  chrome.runtime.onMessage.addListener((req) => {
    if (req && typeof req.type === 'string' && req.type.startsWith('SUPER_LOVABLE_')) {
      const tab = document.querySelector('.tab.active[data-tab="queue"], [data-tab="queue"].active');
      if (tab) renderQueue();
    }
    return false;
  });


  // ---------------- Histórico ----------------
  function renderHistory() {
    const wrap = $('historyList');
    const q = $('historySearch').value || '';
    const onlyProject = $('historyProjectFilter').checked;
    const items = window.HistoryManager.search({
      query: q,
      project: onlyProject ? window.LCA.projectId : '',
    });
    wrap.innerHTML = '';
    if (!items.length) {
      wrap.innerHTML = '<p class="muted">Nenhum registro.</p>';
      return;
    }
    items.slice(0, 200).forEach((it) => {
      const row = document.createElement('div');
      row.className = 'h-item';
      row.innerHTML = `
        <div class="h-head">
          <span class="h-date">${new Date(it.date).toLocaleString()}</span>
          <span class="h-status ${it.status === 'falhou' ? 'bad' : 'ok'}">${it.status}</span>
        </div>
        <div class="h-text"></div>
        <div class="h-meta">${it.project || '-'} · ${it.model || 'auto'} · ${it.origin}${it.durationMs ? ` · ${Math.round(it.durationMs / 1000)}s` : ''}</div>
        <div class="h-actions"></div>`;
      row.querySelector('.h-text').textContent = it.text;
      const acts = row.querySelector('.h-actions');
      const mk = (t, title, fn) => {
        const b = document.createElement('button');
        b.className = 'chip-btn';
        b.textContent = t;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', fn);
        acts.appendChild(b);
      };
      mk('⧉', 'Copiar', () => navigator.clipboard.writeText(it.text).catch(() => {}));
      mk('↺', 'Reutilizar no prompt', () => {
        window.LCA.els.input.value = it.text;
        document.querySelector('.tab[data-tab="prompt"]').click();
      });
      mk('+', 'Adicionar à fila', async () => {
        await window.QueueManager.add({ text: it.text, files: [] });
        window.LCA.setStatus('Adicionado à fila.', 'success');
      });
      mk(it.favorite ? '★' : '☆', 'Favoritar', async () => { await window.HistoryManager.toggleFavorite(it.id); renderHistory(); });
      mk('🗑', 'Excluir', async () => {
        if (!window.ShieldManager.confirmDestructive('Excluir este registro?')) return;
        await window.HistoryManager.remove(it.id);
        renderHistory();
      });
      wrap.appendChild(row);
    });
  }

  // ---------------- Melhorar prompt ----------------
  function openImproveModal(original, improved, source) {
    const modal = $('improveModal');
    $('improveOriginal').textContent = original;
    const box = $('improveResult');
    box.value = improved;
    $('improveSource').textContent = source === 'local' ? 'melhoria local' : 'endpoint configurado';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal(id) {
    const m = $(id);
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
  }

  async function improvePrompt() {
    try {
      const text = window.LCA.els.input.value;
      const mode = $('improveMode').value;
      StatusBar.set(window.I18n.t('st_preparing'), 'info');
      const { text: improved, source } = await window.PromptEnhancer.improve({
        text,
        mode,
        projectContext: { projectId: window.LCA.projectId },
      });
      openImproveModal(text, improved, source);
    } catch (e) {
      window.LCA.setStatus(e.message, 'error', 6000);
      StatusBar.set(e.message, 'error', { sticky: true });
    }
  }

  // ---------------- Gravação ----------------
  function initRecorder() {
    const btn = $('recordBtn');
    const panel = $('recorderPanel');
    const timeEl = $('recTime');
    const pauseBtn = $('recPause');
    const stopBtn = $('recStop');
    const cancelBtn = $('recCancel');

    window.AudioRecorder.onChange(({ state, seconds, error }) => {
      panel.classList.toggle('open', state === 'recording' || state === 'paused' || state === 'processing' || state === 'permission');
      timeEl.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      $('recState').textContent = {
        idle: '', permission: 'aguardando permissão', recording: 'gravando',
        paused: 'pausado', processing: 'processando', ready: 'pronto', error: 'erro',
      }[state] || state;
      pauseBtn.textContent = state === 'paused' ? '▶' : '❚❚';
      btn.classList.toggle('recording', state === 'recording');
      if (error) {
        window.LCA.setStatus(error, 'error', 8000);
        StatusBar.set(error, 'error', { sticky: true, detail: error });
        $('recHelp').hidden = false;
        $('recorderPanel').classList.add('open');
      }
    });

    // Abre a página da extensão que consegue exibir o aviso de permissão do Chrome.
    function openMicPermission() {
      const msg = 'Abrimos uma aba para o Chrome pedir autorização do microfone. Permita e volte aqui.';
      window.LCA.setStatus(msg, 'info', 8000);
      StatusBar.set(msg, 'warn', { sticky: true });
      try { chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') }); } catch (e) { /* noop */ }
    }

    /** Recebe a gravação, transcreve e escreve o texto no campo do prompt. */
    async function transcribeAndFill(file) {
      const input = $('messageInput') || window.LCA?.els?.input;
      window.LCA.setStatus('Transcrevendo sua fala…', 'info', 15000);
      StatusBar.set('Transcrevendo sua fala…', 'info', { sticky: true });
      try {
        const text = await window.Transcription.transcribe(file);
        if (input) {
          const cur = (input.value || '').trim();
          input.value = cur ? `${cur} ${text}` : text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
        window.LCA.setStatus('Fala transcrita no campo do prompt.', 'success');
        StatusBar.set('Fala transcrita no campo do prompt.', 'success');
      } catch (e) {
        window.LCA.setStatus(e.message, 'error', 8000);
        StatusBar.set(e.message, 'error', { sticky: true });
      }
    }

    btn.addEventListener('click', async () => {
      if (window.AudioRecorder.state === 'recording' || window.AudioRecorder.state === 'paused') {
        window.AudioRecorder.stop()
          .then(transcribeAndFill)
          .catch(() => { /* já reportado pelo onChange */ });
        return;
      }

      // 1) Se o Chrome ainda não decidiu, a página dedicada mostra o pop-up nativo.
      let perm = null;
      try {
        perm = await navigator.permissions.query({ name: 'microphone' });
      } catch (e) { perm = null; }
      if (perm && perm.state !== 'granted') {
        openMicPermission();
        if (perm.state === 'denied') return;
      }

      // 2) Com a permissão concedida, grava direto no painel.
      window.AudioRecorder.requestStream()
        .then((stream) => window.AudioRecorder.startWithStream(stream))
        .catch((e) => {
          const denied = /denied|not allowed|dismissed|permission/i.test(`${e.name} ${e.message}`);
          if (denied) { openMicPermission(); return; }
          const msg = `Microfone indisponível: ${e.message}`;
          window.LCA.setStatus(msg, 'error', 8000);
          StatusBar.set(msg, 'error', { sticky: true });
          $('recHelp').hidden = false;
          $('recorderPanel').classList.add('open');
        });
    });


    pauseBtn.addEventListener('click', () => {
      if (window.AudioRecorder.state === 'paused') window.AudioRecorder.resume();
      else window.AudioRecorder.pause();
    });
    stopBtn.addEventListener('click', async () => {
      try {
        const file = await window.AudioRecorder.stop();
        await transcribeAndFill(file);
      } catch (e) { window.LCA.setStatus(e.message, 'error'); }
    });
    cancelBtn.addEventListener('click', () => window.AudioRecorder.cancel());
    $('recHelp').addEventListener('click', () => $('micModal').classList.add('open'));
    $('micClose').addEventListener('click', () => closeModal('micModal'));
    $('micOpenSettings').addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
    });
  }

  // ---------------- Ferramentas ----------------
  function initTools() {
    let downloadBusy = false;
    $('toolDownload').addEventListener('click', async () => {
      const out = $('toolOutput');
      const btn = $('toolDownload');
      if (downloadBusy) return;
      downloadBusy = true;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = '⬇️ Preparando download...';
      out.textContent = 'Preparando download...';
      try {
        const r = await window.ActionRouter.run('DOWNLOAD_PROJECT', {
          onProgress: (p) => {
            if (p.phase === 'validate' || p.phase === 'list') {
              btn.textContent = '⬇️ Baixando arquivos do projeto...';
              out.textContent = p.message || 'Baixando arquivos do projeto...';
            }
            if (p.phase === 'found') {
              out.textContent = `${p.total} arquivos encontrados.${p.total > 300 ? ' Projetos grandes podem levar alguns instantes.' : ''}`;
            }
            if (p.phase === 'download') {
              btn.textContent = `⬇️ Baixando ${p.done} de ${p.total} arquivos...`;
              out.textContent = `${p.done} de ${p.total} arquivos baixados${p.failures ? ` · falhas: ${p.failures}` : ''}`;
            }
            if (p.phase === 'zip') {
              btn.textContent = '⬇️ Criando arquivo ZIP...';
              out.textContent = 'Criando arquivo ZIP...';
            }
          }
        }, window.LCA.projectId);

        if (r.success) {
          btn.textContent = '⬇️ Download concluído';
          out.textContent = `${r.data.fileName} · ${r.data.downloaded} de ${r.data.total} arquivos${r.data.failures.length ? ` · ${r.data.failures.length} não incluídos (veja DOWNLOAD-REPORT.txt)` : ''}`;
          window.NotificationManager.play('uploadDone');
        } else {
          throw new Error(r.message);
        }
        setTimeout(() => { btn.textContent = label; }, 4000);
      } catch (e) {
        btn.textContent = '⬇️ Não foi possível baixar o projeto';
        out.textContent = e.message;
        StatusBar.set(e.message, 'error', { sticky: true, detail: e.message, onRetry: () => $('toolDownload').click() });
        setTimeout(() => { btn.textContent = label; }, 4000);
      } finally {
        downloadBusy = false;
        btn.disabled = false;
      }
    });


    $('toolCreateProject').addEventListener('click', () => $('createModal').classList.add('open'));
    $('createCancel').addEventListener('click', () => closeModal('createModal'));
    $('createConfirm').addEventListener('click', async () => {
      const out = $('createOutput');
      const payload = {
        name: $('createName').value.trim(),
        description: $('createDesc').value.trim(),
        initialPrompt: $('createPrompt').value.trim(),
        blank: $('createBlank').checked,
      };
      if (!payload.name) { out.textContent = 'Informe um nome.'; return; }
      out.textContent = 'Verificando integração…';
      try {
        const r = await window.ActionRouter.run('CREATE_PROJECT', payload, window.LCA.projectId);
        out.textContent = r.message || (r.success ? 'Projeto criado.' : window.I18n.t('err_unavailable'));
        if (r.success) window.NotificationManager.play('sendDone');
      } catch (e) {
        out.textContent = e.message;
      }
    });

    $('toolCloud').addEventListener('click', async () => {
      const out = $('toolOutput');
      out.textContent = 'Verificando o estado do projeto…';
      try {
        const st = await window.ActionRouter.run('CHECK_CLOUD', {}, window.LCA.projectId);
        out.textContent = st.message || window.I18n.t('err_unavailable');
        const ready = st.success && st.data && st.data.status === 'ready';
        if (!st.success || ready) return;
        const ok = window.confirm('Será ativado o Lovable Cloud (banco de dados, autenticação e funções) neste projeto. Continuar?');
        if (!ok) { out.textContent = 'Ação cancelada.'; return; }
        const res = await window.ActionRouter.run(
          'ENABLE_CLOUD',
          {
            confirmed: true,
            chatFallbackText: window.CloudManager.cloudPrompt(),
          },
          window.LCA.projectId,
        );
        out.textContent = res.message || window.I18n.t('err_unavailable');
      } catch (e) {
        out.textContent = e.message;
      }
    });

    $('toolWatermark').addEventListener('click', async () => {
      const btn = $('toolWatermark');
      const out = $('toolOutput');
      const idleLabel = '🏷️ Remover marca';
      if (btn.dataset.busy === 'true') return;
      btn.dataset.busy = 'true';
      btn.disabled = true;
      btn.textContent = '⏳ Removendo marca d’água…';
      out.textContent = 'Removendo marca d’água…';
      try {
        const r = await window.ActionRouter.run('REMOVE_WATERMARK', {}, window.LCA.projectId);
        const res = r.data || {};
        out.textContent = r.message || res.message;
        if (r.success && res.state === 'done') {
          btn.textContent = '✅ Marca removida';
          out.textContent = res.confirmed
            ? `${res.message}. Atualize o preview do projeto para conferir.`
            : `${res.message}. Atualize o preview para confirmar.`;
          btn.disabled = false;
          btn.dataset.busy = 'false';
          setTimeout(() => { btn.textContent = idleLabel; }, 8000);
          return;
        }
        const labels = {
          not_synced: '⚠️ Projeto não sincronizado',
          license_invalid: '🔒 Licença inválida',
          auth_error: '🔒 Erro de autenticação',
          unavailable: '🚫 Operação indisponível',
          error: '⚠️ Erro inesperado',
          processing: '⏳ Removendo marca d’água…',
        };
        btn.textContent = labels[res.state] || labels.error;
        setTimeout(() => { btn.textContent = idleLabel; }, 6000);
      } catch (e) {
        console.error('watermark', e);
        out.textContent = e.message || 'Erro inesperado na remoção de marca.';
        btn.textContent = '⚠️ Erro inesperado';
        setTimeout(() => { btn.textContent = idleLabel; }, 6000);
      } finally {
        btn.disabled = false;
        btn.dataset.busy = 'false';
      }
    });


    const shieldBtn = $('toolShield');
    const paintShield = () => {
      const on = window.ShieldManager.active;
      shieldBtn.textContent = on ? '🛡️ Escudo ativo' : '🛡️ Ativar Escudo';
      shieldBtn.classList.toggle('on', on);
      paintHeader();
    };
    shieldBtn.addEventListener('click', async () => { await window.ShieldManager.toggle(); paintShield(); });
    paintShield();

    $('toolShieldLog').addEventListener('click', () => {
      const log = window.ShieldManager.log;
      $('toolOutput').textContent = log.length
        ? log.map((l) => `${new Date(l.ts).toLocaleTimeString()} [${l.scope}] ${l.message}`).join('\n')
        : 'Nenhum registro técnico ainda.';
    });
  }

  // ---------------- Configurações ----------------
  function initSettings() {
    const s = window.SettingsManager.all;
    const bind = (id, key, type = 'checkbox') => {
      const el = $(id);
      if (!el) return;
      if (type === 'checkbox') el.checked = !!s[key];
      else el.value = s[key];
      el.addEventListener('change', async () => {
        const value = type === 'checkbox' ? el.checked : type === 'number' ? Number(el.value) : el.value;
        await window.SettingsManager.set({ [key]: value });
        if (key === 'aiEndpoint') { await window.AiProviderClient.setEndpoint(value); await initModel(); }
        if (key === 'sounds' || key === 'shield') paintHeader();
        if (key === 'language') { window.I18n.apply(); }
        if (key === 'shield') { window.ShieldManager.load(); }
      });
    };
    bind('setSounds', 'sounds');
    bind('setNotifications', 'notifications');
    bind('setShield', 'shield');
    bind('setConfirmSend', 'confirmBeforeSend');
    bind('setConfirmDelete', 'confirmDeletions');
    bind('setInterval', 'queueInterval', 'number');
    bind('setCompletion', 'queueCompletionMode', 'select');
    bind('setHistoryLimit', 'historyLimit', 'number');
    bind('setMode', 'defaultMode', 'select');
    bind('setModel', 'defaultModel', 'select');
    bind('setLanguage', 'language', 'select');
    bind('setNative', 'nativeCapture');
    bind('setAiEndpoint', 'aiEndpoint', 'text');
    bind('setTranscription', 'transcriptionEndpoint', 'text');

    $('setClearHistory').addEventListener('click', async () => {
      if (!window.ShieldManager.confirmDestructive('Limpar todo o histórico?')) return;
      await window.HistoryManager.clear();
      renderHistory();
    });
    $('setClearQueue').addEventListener('click', async () => {
      if (!window.ShieldManager.confirmDestructive('Limpar toda a fila?')) return;
      await window.QueueManager.clearAll();
      renderQueue();
    });
    $('setRestoreShortcuts').addEventListener('click', async () => {
      await window.QuickActions.restore();
      renderShortcuts();
      renderShortcutEditor();
    });
    $('setExport').addEventListener('click', () => {
      const blob = new Blob([window.SettingsManager.export()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'super-lovable-settings.json';
      a.click();
    });
    $('setImport').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        await window.SettingsManager.import(await f.text());
        window.location.reload();
      } catch (err) {
        window.LCA.setStatus(err.message, 'error', 6000);
      }
      e.target.value = '';
    });
  }

  // ---------------- Envio (adaptadores em volta do fluxo original) ----------------
  function wrapSend() {
    const original = window.LCA.sendMessage; // backup lógico
    window.LCA.sendMessageOriginal = original;

    window.LCA.sendMessage = async function guardedSend(...args) {
      const projectId = window.LCA.projectId;
      const block = window.ShieldManager.guardSend({
        projectId,
        hasSession: !!window.LCA.authToken,
      });
      if (block) {
        window.LCA.setStatus(block, 'error', 6000);
        StatusBar.set(block, 'error', { sticky: true });
        window.NotificationManager.play('error');
        return;
      }
      if (window.SettingsManager.get('confirmBeforeSend') && !window.ShieldManager.confirmDestructive('Confirmar envio deste prompt?')) {
        return;
      }
      const text = window.LCA.els.input.value;
      const names = window.LCA.attachments.map((a) => a.file.name);
      // Já existe comando em execução? O novo vai para a fila em vez de disputar.
      const qs = window.QueueManager.state;
      if (!window.QueueManager._executing && (window.LCA.isBusy || (qs.running && qs.current))) {
        const pos = await window.QueueManager.add({
          text: text.trim(),
          files: window.LCA.attachments.map((a) => a.file),
          model: window.LCA_selectedModel || 'auto',
          origin: 'popup',
        });
        void pos;
        window.LCA.els.input.value = '';
        window.LCA.attachments.splice(0).forEach((a) => a.el?.remove());
        StatusBar.set('Já há um comando em execução — adicionado à fila.', 'warn');
        window.LCA_UI.renderQueue();
        return;
      }
      const started = Date.now();
      window.ShieldManager.begin();
      window.ShieldManager.audit('envio', `projeto ${projectId} · ${names.length} anexo(s)`);
      window.NotificationManager.play('sendStart');
      StatusBar.set(window.I18n.t('st_sending'), 'info', { sticky: true });
      try {
        await original.apply(this, args);
        const failed = window.LCA.els.input.value === text && text.trim() !== '';
        StatusBar.set(failed ? window.I18n.t('st_failed') : window.I18n.t('st_done'), failed ? 'error' : 'success', { sticky: failed });
        window.NotificationManager.play(failed ? 'error' : 'sendDone');
        if (!failed) {
          selectedShortcut = null;
          renderShortcuts();
          await window.NotificationManager.notify('SUPER LOVABLE', 'Comando enviado com sucesso.');
        }
        await window.HistoryManager.add({
          text, project: projectId, status: failed ? 'falhou' : 'concluído',
          model: window.LCA_selectedModel || 'auto', origin: 'prompt',
          attachments: names, durationMs: Date.now() - started,
        });
        if (document.querySelector('#panel-history.active')) renderHistory();
      } finally {
        window.ShieldManager.end();
      }
    };
  }

  // ---------------- Atalhos de teclado ----------------
  function initShortcutsKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
        if (['recording', 'paused'].includes(window.AudioRecorder.state)) window.AudioRecorder.cancel();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); $('queueBtn').click(); }
      else if (e.key === 'Enter') { e.preventDefault(); window.LCA.els.send.click(); }
      else if (e.key.toLowerCase() === 'u') { e.preventDefault(); window.LCA.els.fileInput.click(); }
      else if (e.key.toLowerCase() === 'm') { e.preventDefault(); $('recordBtn').click(); }
    });
  }

  // ---------------- Cabeçalho / indicadores ----------------
  function paintHeader() {
    const id = window.LCA.projectId;
    const short = id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—';
    $('projectShort').textContent = short;
    $('projectLabel').textContent = id ? 'Projeto conectado' : 'Nenhum projeto detectado';
    $('connDot').classList.toggle('on', !!id && !!window.LCA.authToken);
    $('indProject').classList.toggle('on', !!id);
    $('indSound').classList.toggle('on', !!window.SettingsManager.get('sounds'));
    $('indShield').classList.toggle('on', window.ShieldManager.active);
    const q = window.QueueManager.state;
    const running = q.running && !q.paused;
    $('indQueue').textContent = running ? 'Fila em execução' : q.paused ? 'Fila pausada' : 'Fila parada';
    $('indQueue').classList.toggle('busy', running);
  }

  function initHeader() {
    $('copyProject').addEventListener('click', async () => {
      const id = window.LCA.projectId;
      if (!id) return window.LCA.setStatus('Nenhum projeto detectado.', 'error');
      await navigator.clipboard.writeText(id).catch(() => {});
      window.LCA.setStatus('ID do projeto copiado.', 'success', 2500);
    });
    paintHeader();
  }

  async function initDevice() {
    const id = await window.DeviceId.ensure();
    $('deviceId').textContent = window.DeviceId.mask(id);
    $('deviceId').title = 'Identificador exclusivo desta instalação da SUPER LOVABLE.';
    $('copyDevice').addEventListener('click', async () => {
      await navigator.clipboard.writeText(id).catch(() => {});
      window.LCA.setStatus('ID do dispositivo copiado.', 'success', 2500);
    });
  }

  function initComposerMeta() {
    const input = window.LCA.els.input;
    const count = $('charCount');
    const paint = () => {
      count.textContent = String(input.value.length);
      count.classList.toggle('warn', input.value.length > 4000);
    };
    input.addEventListener('input', paint);
    paint();
  }

  // ---------------- Boot ----------------
  async function boot() {
    StatusBar.el = $('statusBar');
    await window.SettingsManager.load();
    window.I18n.apply();
    await Promise.all([
      window.QuickActions.load(),
      window.HistoryManager.load(),
      window.QueueManager.load(),
      window.ShieldManager.load(),
    ]);
    window.AttachmentManager.enhance();
    window.AttachmentManager.bindDropAndPaste($('panel-prompt'));
    initTabs();
    initHeader();
    await initDevice();
    await initModel();
    initComposerMeta();
    await drainPending();
    renderShortcuts();
    renderShortcutEditor();
    renderQueue();
    renderHistory();
    const resetSend = $('resetSendMode');
    if (resetSend) {
      resetSend.addEventListener('click', () => {
        chrome.storage.local.remove('sl_send_mode_pref', () => {
          window.LCA.setStatus('A escolha entre envio automático e pendente voltará a ser perguntada.', 'success');
        });
      });
    }
    initRecorder();
    initTools();
    initSettings();
    initShortcutsKeys();
    wrapSend();

    $('improveBtn').addEventListener('click', improvePrompt);
    $('improveUse').addEventListener('click', () => {
      window.LCA.els.input.value = $('improveResult').value;
      closeModal('improveModal');
    });
    $('improveKeep').addEventListener('click', () => closeModal('improveModal'));
    $('improveCopy').addEventListener('click', () => navigator.clipboard.writeText($('improveResult').value).catch(() => {}));
    $('improveCancel').addEventListener('click', () => closeModal('improveModal'));

    $('queueBtn').addEventListener('click', async () => {
      const text = window.LCA.els.input.value.trim();
      const files = window.LCA.attachments.map((a) => a.file);
      try {
        await window.QueueManager.add({ text, files, model: window.LCA_selectedModel || 'auto' });
        window.LCA.els.input.value = '';
        window.LCA.attachments.splice(0).forEach((a) => a.el?.remove());
        window.LCA.setStatus('Adicionado à fila.', 'success');
        renderQueue();
      } catch (e) {
        window.LCA.setStatus(e.message, 'error');
      }
    });
    $('queueRun').addEventListener('click', () => { window.QueueManager.resume(); renderQueue(); });
    $('queuePause').addEventListener('click', () => {
      window.QueueManager.pause();
      StatusBar.set(window.I18n.t('st_paused'), 'warn', { sticky: true });
      renderQueue();
    });
    $('queueClearDone').addEventListener('click', async () => { await window.QueueManager.clearDone(); renderQueue(); });
    $('queueClearAll').addEventListener('click', async () => {
      if (!window.ShieldManager.confirmDestructive('Limpar toda a fila?')) return;
      await window.QueueManager.clearAll();
      renderQueue();
    });
    window.QueueManager.onChange(() => {
      if (document.querySelector('#panel-queue.active')) renderQueue();
    });

    $('historySearch').addEventListener('input', renderHistory);
    $('historyProjectFilter').addEventListener('change', renderHistory);
    $('historyClear').addEventListener('click', async () => {
      if (!window.ShieldManager.confirmDestructive('Limpar todo o histórico?')) return;
      await window.HistoryManager.clear();
      renderHistory();
    });
    $('addShortcut').addEventListener('click', async () => {
      const label = window.prompt('Nome do atalho:');
      if (!label) return;
      const text = window.prompt('Texto do atalho:');
      if (!text) return;
      await window.QuickActions.add(label, text);
      renderShortcuts();
      renderShortcutEditor();
    });

    $('queueConfirm').addEventListener('click', () => {
      if (window.QueueManager.confirmManual()) {
        StatusBar.set('Conclusão confirmada. Seguindo para o próximo item.', 'success');
      } else {
        StatusBar.set('Nenhum item aguardando confirmação.', 'warn');
      }
    });
    $('createCopyPrompt').addEventListener('click', () => {
      navigator.clipboard.writeText($('createPrompt').value || '').catch(() => {});
      $('createOutput').textContent = 'Prompt copiado.';
    });
    window.QueueManager.onChange(paintHeader);

    window.addEventListener('offline', () => StatusBar.set('Sem conexão de rede.', 'error', { sticky: true }));
    StatusBar.set(baseStatus(), 'idle');
    await window.StorageManager.session.set('lca_current_project', window.LCA.projectId);
  }

  /** Traz para o histórico os pedidos capturados no campo nativo enquanto o popup estava fechado. */
  async function drainPending() {
    const pending = (await window.StorageManager.local.get('super_lovable_pending_history', [])) || [];
    for (const p of pending) {
      await window.HistoryManager.add({
        text: p.text, project: p.project, status: p.status || 'na fila',
        origin: p.origin || 'chat nativo redirecionado', attachments: p.attachments || [],
      });
    }
    if (pending.length) {
      await window.StorageManager.local.set('super_lovable_pending_history', []);
      StatusBar.set(`${pending.length} pedido(s) do chat nativo estão na fila.`, 'warn');
    }
    const tool = await window.StorageManager.local.get('super_lovable_pending_tool', null);
    if (tool) {
      await window.StorageManager.local.remove('super_lovable_pending_tool');
      const map = { improve: 'improveBtn', watermark: 'toolWatermark', download: 'toolDownload', skills: null };
      if (map[tool.tool]) document.getElementById(map[tool.tool])?.click();
    }
  }

  window.LCA_UI = { boot, renderQueue, renderHistory, StatusBar, paintHeader };
})();
