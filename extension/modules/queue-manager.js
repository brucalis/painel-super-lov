// queue-manager.js — fila sequencial de prompts. Reutiliza integralmente
// window.LCA.sendMessage() (fluxo original) — não monta requisições próprias.
(function () {
  const KEY = 'lca_queue';
  let items = [];
  let running = false;
  let paused = false;
  let current = null;
  const blobs = new Map(); // id -> File[] (memória apenas; blobs não vão para o storage)
  const listeners = [];

  function emit() {
    listeners.forEach((fn) => { try { fn(items, { running, paused }); } catch (e) { console.warn(e); } });
  }

  function persistable() {
    return items.map((i) => ({
      id: i.id, text: i.text, model: i.model, mode: i.mode, date: i.date,
      attempts: i.attempts, status: i.status === 'enviando' ? 'pendente' : i.status,
      error: i.error, attachmentNames: i.attachmentNames || [],
    }));
  }

  const QueueManager = {
    get items() { return items; },
    get state() { return { running, paused, current }; },
    onChange(fn) { listeners.push(fn); },
    async load() {
      items = (await window.StorageManager.local.get(KEY, [])) || [];
      emit();
      return items;
    },
    async save() {
      await window.StorageManager.local.set(KEY, persistable());
      emit();
    },
    async add({ text, files = [], model = 'auto', mode = 'prompt' }) {
      if (!text && files.length === 0) throw new Error('Nada para enfileirar.');
      const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      items.push({
        id, text, model, mode, date: Date.now(), attempts: 0,
        status: 'pendente', error: null,
        attachmentNames: files.map((f) => f.name),
      });
      if (files.length) blobs.set(id, files);
      await QueueManager.save();
      return id;
    },
    async update(id, patch) {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      Object.assign(it, patch);
      await QueueManager.save();
    },
    async remove(id) {
      items = items.filter((i) => i.id !== id);
      blobs.delete(id);
      await QueueManager.save();
    },
    async duplicate(id) {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      const copy = { ...it, id: `q_${Date.now()}`, status: 'pendente', attempts: 0, error: null };
      items.push(copy);
      if (blobs.has(id)) blobs.set(copy.id, blobs.get(id));
      await QueueManager.save();
    },
    async move(id, dir) {
      const i = items.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      await QueueManager.save();
    },
    async moveTo(id, index) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return;
      const [it] = items.splice(i, 1);
      items.splice(Math.max(0, Math.min(index, items.length)), 0, it);
      await QueueManager.save();
    },
    async toTop(id) { await QueueManager.moveTo(id, 0); },
    async clearDone() {
      items = items.filter((i) => i.status !== 'concluído');
      await QueueManager.save();
    },
    async clearAll() {
      items = [];
      blobs.clear();
      await QueueManager.save();
    },
    pause() { paused = true; emit(); },
    resume() { paused = false; emit(); QueueManager.run(); },

    /** Executa um item usando o fluxo original de envio. */
    async runItem(item) {
      const LCA = window.LCA;
      item.status = 'preparando';
      item.attempts += 1;
      await QueueManager.save();

      // Repovoa o composer original (não há caminho de envio alternativo)
      LCA.els.input.value = item.text || '';
      const files = blobs.get(item.id) || [];
      if (files.length) {
        LCA.attachments.splice(0).forEach((a) => a.el?.remove());
        files.forEach((f) => window.AttachmentManager.add(f));
      }
      item.status = 'enviando';
      await QueueManager.save();

      const started = Date.now();
      const before = LCA.els.input.value;
      await LCA.sendMessage(); // fluxo original, intacto
      const failed = LCA.els.input.value === before && LCA.attachments.length > 0;
      if (failed) throw new Error(window.I18n.t('err_generic'));

      item.status = 'aguardando conclusão';
      await QueueManager.save();
      await QueueManager.waitCompletion();
      item.status = 'concluído';
      item.error = null;
      item.durationMs = Date.now() - started;
      blobs.delete(item.id);
      await QueueManager.save();
    },

    /** Sem sinal automático de término, usamos o modo seguro configurado. */
    async waitCompletion() {
      const mode = window.SettingsManager.get('queueCompletionMode');
      const secs = Math.min(60, Math.max(3, Number(window.SettingsManager.get('queueInterval')) || 5));
      if (mode === 'manual') {
        window.NotificationManager.play('actionNeeded');
        const ok = window.confirm('Confirme quando a Lovable terminar este item para continuar a fila.');
        if (!ok) throw new Error('Fila interrompida pelo usuário.');
        return;
      }
      await new Promise((r) => setTimeout(r, secs * 1000));
    },

    async run() {
      if (running || paused) return;
      running = true;
      emit();
      try {
        while (!paused) {
          const next = items.find((i) => i.status === 'pendente');
          if (!next) break;
          current = next.id;
          try {
            await QueueManager.runItem(next);
            await window.HistoryManager.add({
              text: next.text, project: window.LCA.projectId, status: 'concluído',
              model: next.model, origin: 'fila', durationMs: next.durationMs || 0,
              attachments: next.attachmentNames || [],
            });
          } catch (e) {
            next.status = 'falhou';
            next.error = e.message;
            paused = true; // pausa automática em falha
            await QueueManager.save();
            window.NotificationManager.play('error');
            window.LCA.setStatus(`${window.I18n.t('err_queue')} ${e.message}`, 'error', 9000);
            await window.HistoryManager.add({
              text: next.text, project: window.LCA.projectId, status: 'falhou',
              error: e.message, origin: 'fila', attachments: next.attachmentNames || [],
            });
            break;
          }
          current = null;
          const gap = Math.min(60, Math.max(3, Number(window.SettingsManager.get('queueInterval')) || 5));
          await new Promise((r) => setTimeout(r, gap * 1000));
        }
        if (!paused && !items.some((i) => i.status === 'pendente')) {
          window.NotificationManager.play('queueDone');
          window.NotificationManager.notify('Lovable Chat Assistant', 'Fila concluída.');
        }
      } finally {
        running = false;
        current = null;
        emit();
      }
    },
  };

  window.QueueManager = QueueManager;
})();
