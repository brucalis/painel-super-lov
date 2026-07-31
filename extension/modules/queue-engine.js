/* queue-engine.js — motor único da fila da SUPER LOVABLE.
 * Vive no service worker, por isso continua funcionando com o popup fechado.
 * Regras centrais desta atualização:
 *   - submitOrQueuePrompt(): envia agora quando a Lovable está livre; enfileira quando ocupada;
 *   - limite de 10 comandos (MAX_QUEUE_ITEMS);
 *   - avanço automático 3s após a conclusão detectada na página (QUEUE_ADVANCE_DELAY_MS);
 *   - lock (super_lovable_queue_lock) contra dois processadores simultâneos.
 * O envio em si é feito por LovableSender, que reproduz o fluxo original.
 */
(function (root) {
  const QUEUE_KEY = 'sl_queue_v2';
  const META_KEY = 'sl_queue_meta_v2';
  const LOCK_KEY = 'super_lovable_queue_lock';
  const HISTORY_PENDING_KEY = 'super_lovable_pending_history';

  const MAX_QUEUE_ITEMS = 10;
  const QUEUE_ADVANCE_DELAY_MS = 3000;
  const IDLE_STABLE_MS = 2000;
  const MAX_ATTEMPTS = 3;
  const LOCK_TTL_MS = 20000;

  const ACTIVE = ['preparing', 'sending', 'running'];
  // 'pending' = envio manual: fica guardado, pode ser editado e só sai quando a
  // pessoa manda enviar. Não bloqueia nem participa do avanço automático.
  const OPEN = ['queued', 'pending', 'preparing', 'sending', 'running'];

  let ticking = false;

  // ---------------- persistência ----------------
  async function readQueue() {
    const r = await chrome.storage.local.get([QUEUE_KEY, META_KEY]);
    const items = Array.isArray(r[QUEUE_KEY]) ? r[QUEUE_KEY] : [];
    const meta = r[META_KEY] || {
      paused: false,
      consecutiveFailures: 0,
      advanceAt: 0,
      needsConfirmation: null,
      projectConflict: null,
    };
    return { items, meta };
  }

  async function writeQueue(items, meta) {
    const payload = {};
    if (items) payload[QUEUE_KEY] = items.map(reposition());
    if (meta) payload[META_KEY] = meta;
    await chrome.storage.local.set(payload);
  }

  function reposition() {
    let n = 0;
    return (it) => ({ ...it, position: OPEN.includes(it.status) ? ++n : null });
  }

  async function acquireLock() {
    const now = Date.now();
    const r = await chrome.storage.session.get(LOCK_KEY).catch(() => ({}));
    const held = r && r[LOCK_KEY];
    if (held && now - held < LOCK_TTL_MS) return false;
    await chrome.storage.session.set({ [LOCK_KEY]: now }).catch(() => {});
    return true;
  }
  async function releaseLock() {
    await chrome.storage.session.remove(LOCK_KEY).catch(() => {});
  }

  // ---------------- estado de execução na página ----------------
  async function findProjectTab(projectId) {
    const tabs = await chrome.tabs.query({ url: ['https://lovable.dev/*', 'https://*.lovable.dev/*'] });
    if (!tabs.length) return null;
    if (projectId) {
      const exact = tabs.find((t) => (t.url || '').includes(`/projects/${projectId}`));
      if (exact) return exact;
    }
    return tabs.find((t) => /\/projects\//.test(t.url || '')) || tabs[0];
  }

  async function getLovableExecutionState(projectId) {
    const tab = await findProjectTab(projectId);
    if (!tab) {
      return { isRunning: false, confidence: 0, signals: [], projectId: null, lastChangeAt: Date.now(), reachable: false };
    }
    const res = await new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'superLovableState' }, (r) => {
          void chrome.runtime.lastError;
          resolve(r || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
    if (!res) {
      return { isRunning: false, confidence: 0, signals: [], projectId: null, lastChangeAt: Date.now(), reachable: false };
    }
    return { ...res, reachable: true, tabId: tab.id };
  }

  // ---------------- eventos ----------------
  async function broadcast(type, payload = {}) {
    const { items, meta } = await readQueue();
    const message = { type, payload: { ...payload, items, meta, summary: summarize(items, meta) } };
    try { await chrome.runtime.sendMessage(message); } catch (e) { /* sem ouvintes */ }
    try {
      const tabs = await chrome.tabs.query({ url: ['https://lovable.dev/*', 'https://*.lovable.dev/*'] });
      for (const t of tabs) chrome.tabs.sendMessage(t.id, message, () => void chrome.runtime.lastError);
    } catch (e) { /* nenhuma aba */ }
    try {
      const open = items.filter((i) => OPEN.includes(i.status)).length;
      await chrome.action.setBadgeText({ text: open ? String(open) : '' });
      await chrome.action.setBadgeBackgroundColor({ color: '#8B5CF6' });
    } catch (e) { /* badge opcional */ }
  }

  function summarize(items, meta) {
    const open = items.filter((i) => OPEN.includes(i.status));
    const active = items.find((i) => ACTIVE.includes(i.status)) || null;
    return {
      total: open.length,
      waiting: items.filter((i) => i.status === 'queued').length,
      pending: items.filter((i) => i.status === 'pending').length,
      max: MAX_QUEUE_ITEMS,
      isFull: open.length >= MAX_QUEUE_ITEMS,
      paused: !!meta.paused,
      needsConfirmation: meta.needsConfirmation || null,
      projectConflict: meta.projectConflict || null,
      activeId: active ? active.id : null,
      activeStatus: active ? active.status : null,
    };
  }

  async function pushHistory(entry) {
    const r = await chrome.storage.local.get(HISTORY_PENDING_KEY);
    const pending = Array.isArray(r[HISTORY_PENDING_KEY]) ? r[HISTORY_PENDING_KEY] : [];
    pending.push({ date: Date.now(), attachments: [], ...entry });
    await chrome.storage.local.set({ [HISTORY_PENDING_KEY]: pending.slice(-200) });
  }

  // ---------------- API principal ----------------
  function makeItem(data) {
    const now = Date.now();
    return {
      id: `q_${now}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: data.projectId || null,
      text: data.text || '',
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      source: data.source || 'popup',
      // modo de otimização escolhido NO MOMENTO do envio (não muda depois)
      promptMode: (root.PromptModes ? root.PromptModes.get(data.promptMode).id : 'automatic'),
      mode: data.mode === 'pending' ? 'pending' : 'auto',
      model: data.model || 'auto',
      createdAt: now,
      updatedAt: now,
      position: null,
      status: data.mode === 'pending' ? 'pending' : 'queued',
      attempts: 0,
      lastError: null,
      sentAt: null,
      completedAt: null,
    };
  }

  /** Função central: envia agora ou enfileira. Usada por TODOS os pontos de entrada. */
  async function submitOrQueuePrompt(promptData) {
    const { items, meta } = await readQueue();
    const open = items.filter((i) => OPEN.includes(i.status));
    if (open.length >= MAX_QUEUE_ITEMS) {
      return {
        success: false,
        full: true,
        error: `A fila atingiu o limite de ${MAX_QUEUE_ITEMS} comandos. Aguarde a conclusão de um deles para adicionar outro.`,
      };
    }
    if (!promptData.projectId) {
      return { success: false, error: 'Primeiro inicie um projeto na Lovable. Quando o editor abrir, volte a usar a Super Lovable.' };
    }
    if (!(promptData.text || '').trim() && !(promptData.attachments || []).length) {
      return { success: false, error: 'Nada para enviar.' };
    }

    const item = makeItem(promptData);
    if (item.status === 'pending') {
      items.push(item);
      await writeQueue(items, meta);
      const freshP = (await readQueue()).items;
      const posP = freshP.filter((i) => OPEN.includes(i.status)).findIndex((i) => i.id === item.id) + 1;
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', { id: item.id, position: posP });
      return { success: true, sent: false, pending: true, id: item.id, position: posP };
    }
    const active = items.find((i) => ACTIVE.includes(i.status));
    const exec = await getLovableExecutionState(promptData.projectId);
    const canSendNow = !promptData.forceQueue && !meta.paused && !active && !exec.isRunning
      && !items.some((i) => i.status === 'queued');


    items.push(item);
    await writeQueue(items, meta);

    if (canSendNow) {
      const sent = await sendItem(item.id);
      if (sent.success) {
        await broadcast('SUPER_LOVABLE_PROMPT_SENT', { id: item.id });
        return { success: true, sent: true, id: item.id, position: 1 };
      }
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', { id: item.id });
      return { success: true, sent: false, queued: true, id: item.id, position: 1, error: sent.error };
    }

    const fresh = (await readQueue()).items;
    const position = fresh.filter((i) => OPEN.includes(i.status)).findIndex((i) => i.id === item.id) + 1;
    await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', { id: item.id, position });
    scheduleTick(1000);
    return { success: true, sent: false, queued: true, id: item.id, position };
  }

  async function patch(id, changes) {
    const { items, meta } = await readQueue();
    const it = items.find((i) => i.id === id);
    if (!it) return null;
    Object.assign(it, changes, { updatedAt: Date.now() });
    await writeQueue(items, meta);
    return it;
  }

  /** Executa um item específico pelo fluxo original de envio. */
  async function sendItem(id) {
    let it = await patch(id, { status: 'sending' });
    if (!it) return { success: false, error: 'Item inexistente.' };
    await broadcast('SUPER_LOVABLE_EXECUTION_STARTED', { id });
    try {
      // Preparação do prompt: a instrução interna do modo é combinada apenas
      // em memória, aqui, no instante do envio. it.text permanece original.
      const preparedText = root.PromptModes
        ? root.PromptModes.buildPrompt({ text: it.text, modeId: it.promptMode, attachments: it.attachments })
        : it.text;
      await root.LovableSender.sendPrompt({
        projectId: it.projectId,
        text: preparedText,
        files: (it.attachments || []).filter((a) => a && a.url).map((a) => ({ url: a.url, name: a.name, type: a.type })),
      });
      await patch(id, { status: 'running', sentAt: Date.now(), lastError: null });
      const { meta } = await readQueue();
      meta.consecutiveFailures = 0;
      await writeQueue(null, meta);
      await pushHistory({
        text: it.text, promptMode: it.promptMode, project: it.projectId, status: 'enviado',
        origin: it.source, attachments: (it.attachments || []).map((a) => a.name).filter(Boolean),
      });
      scheduleTick(1500);
      return { success: true };
    } catch (err) {
      const { items, meta } = await readQueue();
      const cur = items.find((i) => i.id === id);
      if (cur) {
        cur.attempts += 1;
        cur.lastError = err.message;
        cur.status = cur.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
        cur.updatedAt = Date.now();
      }
      meta.consecutiveFailures = (meta.consecutiveFailures || 0) + 1;
      if (meta.consecutiveFailures >= 3) meta.paused = true;
      await writeQueue(items, meta);
      await pushHistory({ text: it.text, promptMode: it.promptMode, project: it.projectId, status: 'falhou', error: err.message, origin: it.source });
      await broadcast('SUPER_LOVABLE_EXECUTION_FAILED', { id, error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ---------------- ciclo automático ----------------
  let tickTimer = null;
  function scheduleTick(ms = 1500) {
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => { tick().catch(() => {}); }, ms);
  }

  async function tick() {
    if (ticking) return;
    ticking = true;
    const locked = await acquireLock();
    if (!locked) { ticking = false; return; }
    try {
      const { items, meta } = await readQueue();
      const open = items.filter((i) => OPEN.includes(i.status));
      if (!open.length) { await broadcastIfIdleChanged(items, meta); return; }
      if (meta.paused || meta.needsConfirmation) return;

      const active = items.find((i) => ACTIVE.includes(i.status));
      const exec = await getLovableExecutionState(active ? active.projectId : open[0].projectId);

      if (active) {
        if (active.status !== 'running') { scheduleTick(1500); return; }
        if (exec.isRunning) { scheduleTick(1500); return; }
        const sinceSend = Date.now() - (active.sentAt || 0);
        const idleMs = typeof exec.idleMs === 'number' ? exec.idleMs : 0;
        if (!exec.reachable) {
          if (sinceSend > 5 * 60 * 1000) {
            meta.needsConfirmation = 'Não foi possível confirmar se a Lovable concluiu a última solicitação.';
            await writeQueue(items, meta);
            await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
          }
          scheduleTick(3000);
          return;
        }
        if (sinceSend < 4000 || idleMs < IDLE_STABLE_MS) { scheduleTick(1500); return; }

        active.status = 'completed';
        active.completedAt = Date.now();
        active.updatedAt = Date.now();
        meta.advanceAt = Date.now() + QUEUE_ADVANCE_DELAY_MS;
        await writeQueue(items, meta);
        await pushHistory({
          text: active.text, promptMode: active.promptMode, project: active.projectId, status: 'concluído', origin: active.source,
          durationMs: active.completedAt - (active.sentAt || active.completedAt),
        });
        await broadcast('SUPER_LOVABLE_EXECUTION_FINISHED', { id: active.id });
        scheduleTick(QUEUE_ADVANCE_DELAY_MS);
        return;
      }

      if (meta.advanceAt && Date.now() < meta.advanceAt) {
        scheduleTick(meta.advanceAt - Date.now() + 200);
        return;
      }

      const next = items.find((i) => i.status === 'queued');
      if (!next) {
        if (!items.some((i) => OPEN.includes(i.status))) await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', { finished: true });
        return;
      }
      if (exec.isRunning) { scheduleTick(2000); return; }
      if (exec.reachable && exec.projectId && next.projectId && exec.projectId !== next.projectId) {
        meta.paused = true;
        meta.projectConflict = 'O projeto aberto mudou. Confirme antes de continuar esta fila.';
        await writeQueue(items, meta);
        await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
        return;
      }
      await sendItem(next.id);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
    } finally {
      await releaseLock();
      ticking = false;
    }
  }

  let lastIdleBroadcast = 0;
  async function broadcastIfIdleChanged(items, meta) {
    if (Date.now() - lastIdleBroadcast < 30000) return;
    lastIdleBroadcast = Date.now();
    void items; void meta;
  }

  // ---------------- controles ----------------
  const QueueEngine = {
    MAX_QUEUE_ITEMS,
    QUEUE_ADVANCE_DELAY_MS,
    submitOrQueuePrompt,
    getLovableExecutionState,
    tick,
    scheduleTick,
    async snapshot() {
      const { items, meta } = await readQueue();
      return { items, meta, summary: summarize(items, meta) };
    },
    async pause() {
      const { meta } = await readQueue();
      meta.paused = true;
      await writeQueue(null, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
    },
    async resume() {
      const { items, meta } = await readQueue();
      meta.paused = false;
      meta.needsConfirmation = null;
      meta.projectConflict = null;
      meta.consecutiveFailures = 0;
      items.filter((i) => i.status === 'paused').forEach((i) => { i.status = 'queued'; });
      await writeQueue(items, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
      scheduleTick(300);
    },
    /** Confirma manualmente que a Lovable concluiu o item ativo. */
    async confirmCompletion() {
      const { items, meta } = await readQueue();
      const active = items.find((i) => ACTIVE.includes(i.status));
      meta.needsConfirmation = null;
      if (active) {
        active.status = 'completed';
        active.completedAt = Date.now();
        meta.advanceAt = Date.now() + QUEUE_ADVANCE_DELAY_MS;
      }
      await writeQueue(items, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
      scheduleTick(QUEUE_ADVANCE_DELAY_MS);
      return { success: true, had: !!active };
    },
    async keepWaiting() {
      const { meta } = await readQueue();
      meta.needsConfirmation = null;
      await writeQueue(null, meta);
      scheduleTick(2000);
      return { success: true };
    },
    async retry(id) {
      await patch(id, { status: 'queued', lastError: null });
      const { meta } = await readQueue();
      meta.paused = false;
      meta.consecutiveFailures = 0;
      await writeQueue(null, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
      scheduleTick(300);
    },
    async skip(id) {
      await patch(id, { status: 'cancelled' });
      const { meta } = await readQueue();
      meta.paused = false;
      await writeQueue(null, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
      scheduleTick(300);
    },
    async edit(id, text) {
      const { items } = await readQueue();
      const cur = items.find((i) => i.id === id);
      const status = cur && cur.status === 'pending' ? 'pending' : 'queued';
      await patch(id, { text, status, lastError: null });
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
    },
    /** Envio manual: tira do modo pendente e manda na hora (ou entra na fila). */
    async sendNow(id) {
      const { items, meta } = await readQueue();
      const it = items.find((i) => i.id === id);
      if (!it) return { success: false, error: 'Item inexistente.' };
      meta.paused = false;
      it.mode = 'auto';
      it.status = 'queued';
      it.updatedAt = Date.now();
      await writeQueue(items, meta);
      const active = items.find((i) => ACTIVE.includes(i.status));
      const exec = await getLovableExecutionState(it.projectId);
      if (!active && !exec.isRunning) {
        const sent = await sendItem(id);
        await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', { id });
        return { success: sent.success, sent: sent.success, error: sent.error };
      }
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', { id });
      scheduleTick(800);
      return { success: true, sent: false, queued: true };
    },
    /** Alterna entre envio automático e envio pendente. */
    async setMode(id, mode) {
      const next = mode === 'pending' ? 'pending' : 'auto';
      const { items, meta } = await readQueue();
      const it = items.find((i) => i.id === id);
      if (!it) return { success: false };
      if (!['queued', 'pending'].includes(it.status)) return { success: false, error: 'Este item já está em execução.' };
      it.mode = next;
      it.status = next === 'pending' ? 'pending' : 'queued';
      it.updatedAt = Date.now();
      await writeQueue(items, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', { id });
      if (next === 'auto') scheduleTick(500);
      return { success: true };
    },
    async remove(id) {
      const { items, meta } = await readQueue();
      await writeQueue(items.filter((i) => i.id !== id), meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
    },
    async moveTo(id, index) {
      const { items, meta } = await readQueue();
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return;
      const [it] = items.splice(i, 1);
      items.splice(Math.max(0, Math.min(index, items.length)), 0, it);
      await writeQueue(items, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
    },
    async duplicate(id) {
      const { items, meta } = await readQueue();
      const it = items.find((x) => x.id === id);
      if (!it) return;
      const open = items.filter((i) => OPEN.includes(i.status)).length;
      if (open >= MAX_QUEUE_ITEMS) return;
      items.push({ ...makeItem(it), text: it.text, attachments: it.attachments });
      await writeQueue(items, meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
      scheduleTick(500);
    },
    async clearDone() {
      const { items, meta } = await readQueue();
      await writeQueue(items.filter((i) => OPEN.includes(i.status)), meta);
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
    },
    async clearAll() {
      await writeQueue([], {
        paused: false, consecutiveFailures: 0, advanceAt: 0, needsConfirmation: null, projectConflict: null,
      });
      await broadcast('SUPER_LOVABLE_QUEUE_UPDATED', {});
    },
  };

  root.QueueEngine = QueueEngine;
})(typeof self !== 'undefined' ? self : globalThis);
