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

  // ---------------- Modelo ----------------
  async function initModel() {
    const wrap = $('modelPicker');
    const models = [
      { id: 'auto', label: 'Automático', available: true },
      { id: 'gemini', label: 'Gemini', available: false },
      { id: 'claude', label: 'Claude', available: false },
    ];
    const map = (await window.StorageManager.local.get('lca_model_by_project', {})) || {};
    const projectId = window.LCA.projectId || 'global';
    let selected = map[projectId] || window.SettingsManager.get('defaultModel') || 'auto';
    if (!models.find((m) => m.id === selected && m.available)) selected = 'auto';

    wrap.innerHTML = '';
    models.forEach((m) => {
      const b = document.createElement('button');
      b.className = `model-chip${m.id === selected ? ' active' : ''}${m.available ? '' : ' off'}`;
      b.textContent = m.label;
      b.setAttribute('aria-label', `${window.I18n.t('model')}: ${m.label}`);
      b.title = m.available
        ? m.label
        : 'Indisponível: depende de suporte da API atual. O envio continua em modo Automático.';
      b.addEventListener('click', async () => {
        if (!m.available) {
          window.LCA.setStatus('Este modelo depende de suporte da API atual. Mantendo Automático.', 'info', 5000);
          return;
        }
        selected = m.id;
        map[projectId] = m.id;
        await window.StorageManager.local.set('lca_model_by_project', map);
        initModel();
      });
      wrap.appendChild(b);
    });
    window.LCA_selectedModel = selected;
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
  function renderQueue() {
    const wrap = $('queueList');
    const items = window.QueueManager.items;
    wrap.innerHTML = '';
    if (!items.length) {
      wrap.innerHTML = '<p class="muted">A fila está vazia.</p>';
      return;
    }
    items.forEach((it, index) => {
      const row = document.createElement('div');
      row.className = `q-item status-${it.status.replace(/\s/g, '-')}`;
      row.draggable = true;
      row.innerHTML = `
        <div class="q-head"><b>#${index + 1}</b> <span class="q-status">${it.status}</span></div>
        <div class="q-text"></div>
        ${it.attachmentNames?.length ? `<div class="q-files">📎 ${it.attachmentNames.join(', ')}</div>` : ''}
        ${it.error ? `<div class="q-error">${it.error}</div>` : ''}
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
      mk('▲', 'Mover para o topo', async () => { await window.QueueManager.toTop(it.id); renderQueue(); });
      mk('✎', 'Editar', async () => {
        const text = window.prompt('Editar prompt:', it.text);
        if (text === null) return;
        await window.QueueManager.update(it.id, { text, status: 'pendente', error: null });
        renderQueue();
      });
      mk('⧉', 'Duplicar', async () => { await window.QueueManager.duplicate(it.id); renderQueue(); });
      mk('➤', 'Enviar agora', async () => {
        await window.QueueManager.moveTo(it.id, 0);
        await window.QueueManager.update(it.id, { status: 'pendente', error: null });
        window.QueueManager.resume();
        renderQueue();
      });
      mk('🗑', 'Remover', async () => {
        if (!window.ShieldManager.confirmDestructive('Remover este item da fila?')) return;
        await window.QueueManager.remove(it.id);
        renderQueue();
      });
      row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', it.id));
      row.addEventListener('dragover', (e) => e.preventDefault());
      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id && id !== it.id) { await window.QueueManager.moveTo(id, index); renderQueue(); }
      });
      wrap.appendChild(row);
    });
  }

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
        window.LCA.setStatus(error, 'error', 6000);
        StatusBar.set(error, 'error', { sticky: true });
      }
    });

    btn.addEventListener('click', async () => {
      try {
        if (window.AudioRecorder.state === 'recording' || window.AudioRecorder.state === 'paused') {
          const file = await window.AudioRecorder.stop();
          window.AttachmentManager.add(file);
          window.LCA.setStatus('Gravação anexada ao prompt.', 'success');
        } else {
          await window.AudioRecorder.start();
        }
      } catch (e) { /* já reportado pelo onChange */ }
    });
    pauseBtn.addEventListener('click', () => {
      if (window.AudioRecorder.state === 'paused') window.AudioRecorder.resume();
      else window.AudioRecorder.pause();
    });
    stopBtn.addEventListener('click', async () => {
      try {
        const file = await window.AudioRecorder.stop();
        window.AttachmentManager.add(file);
      } catch (e) { window.LCA.setStatus(e.message, 'error'); }
    });
    cancelBtn.addEventListener('click', () => window.AudioRecorder.cancel());
  }

  // ---------------- Ferramentas ----------------
  function initTools() {
    $('toolDownload').addEventListener('click', async () => {
      const out = $('toolOutput');
      out.textContent = 'Consultando arquivos do projeto…';
      try {
        const r = await window.ProjectFiles.downloadAll((p) => {
          if (p.phase === 'found') out.textContent = `${p.total} arquivos encontrados.`;
          if (p.phase === 'download') out.textContent = `Baixando ${p.done}/${p.total} (falhas: ${p.failures})`;
        });
        out.textContent = `ZIP gerado: ${r.downloaded}/${r.total} arquivos. Falhas: ${r.failures.length}.`;
        window.NotificationManager.play('uploadDone');
      } catch (e) {
        out.textContent = e.message;
        StatusBar.set(e.message, 'error', { sticky: true, detail: e.message, onRetry: () => $('toolDownload').click() });
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
        const r = await window.CloudManager.createProject(payload);
        if (r.created) {
          out.textContent = 'Projeto criado.';
          window.NotificationManager.play('sendDone');
        } else {
          out.textContent = `${window.I18n.t('err_unavailable')} Abrindo o fluxo oficial…`;
          out.textContent = await window.CloudManager.fallbackCreate(payload.initialPrompt || payload.description);
        }
      } catch (e) {
        out.textContent = e.message;
      }
    });

    $('toolCloud').addEventListener('click', async () => {
      const out = $('toolOutput');
      out.textContent = 'Verificando o estado do projeto…';
      try {
        const st = await window.CloudManager.checkCloud();
        if (!st.available) {
          out.textContent = window.I18n.t('err_unavailable');
          return;
        }
        if (st.enabled) { out.textContent = 'O Lovable Cloud já parece ativo neste projeto.'; return; }
        const ok = window.confirm('Será enviado um pedido de ativação do Lovable Cloud (banco de dados, autenticação e funções) para este projeto. Continuar?');
        if (!ok) { out.textContent = 'Ação cancelada.'; return; }
        window.LCA.els.input.value = window.CloudManager.cloudPrompt();
        document.querySelector('.tab[data-tab="prompt"]').click();
        out.textContent = 'Pedido preparado no prompt. Revise e clique em Enviar agora.';
      } catch (e) {
        out.textContent = e.message;
      }
    });

    $('toolWatermark').addEventListener('click', async () => {
      const out = $('toolOutput');
      out.textContent = window.WatermarkManager.notice();
      try {
        const found = await window.WatermarkManager.detect();
        if (!found) { out.textContent = window.I18n.t('wm_none'); return; }
        const ok = window.confirm(`Elemento encontrado:\n${found.selector}\n\n${found.text || ''}\n\nPreparar pedido de remoção?`);
        if (!ok) { out.textContent = 'Ação cancelada.'; return; }
        window.LCA.els.input.value = window.WatermarkManager.buildPrompt(found);
        document.querySelector('.tab[data-tab="prompt"]').click();
        out.textContent = 'Pedido preparado no prompt. Revise e envie.';
      } catch (e) {
        out.textContent = e.message;
      }
    });

    const shieldBtn = $('toolShield');
    const paintShield = () => {
      const on = window.ShieldManager.active;
      shieldBtn.textContent = on ? '🛡️ Escudo ativo' : '🛡️ Ativar Escudo';
      shieldBtn.classList.toggle('on', on);
      $('shieldBadge').hidden = !on;
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
    bind('setEnhancer', 'enhancerEndpoint', 'text');
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
      a.download = 'lovable-chat-assistant-settings.json';
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
          await window.NotificationManager.notify('Lovable Chat Assistant', 'Comando enviado com sucesso.');
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
    await initModel();
    renderShortcuts();
    renderShortcutEditor();
    renderQueue();
    renderHistory();
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

    window.addEventListener('offline', () => StatusBar.set('Sem conexão de rede.', 'error', { sticky: true }));
    StatusBar.set(baseStatus(), 'idle');
    await window.StorageManager.session.set('lca_current_project', window.LCA.projectId);
  }

  window.LCA_UI = { boot, renderQueue, renderHistory, StatusBar };
})();
