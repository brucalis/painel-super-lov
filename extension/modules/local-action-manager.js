/* local-action-manager.js — executa tudo que a extensão resolve sozinha,
 * sem consumir processamento da Lovable.
 */
(function (root) {
  function ok(status, data, message) {
    return { success: true, type: 'local', status: status || 'completed', data, message };
  }
  function fail(code, message) {
    return { success: false, type: 'local', status: 'failed', code, message, canRetry: true };
  }

  const HANDLERS = {
    async IMPROVE_PROMPT({ text, mode, projectContext }) {
      const res = await root.PromptEnhancer.improve({ text, mode, projectContext });
      return ok('completed', res);
    },

    async ADD_TO_QUEUE(payload, action) {
      const res = await chrome.runtime.sendMessage({
        action: 'SUPER_LOVABLE_ENQUEUE_PROMPT',
        data: {
          text: payload.text,
          attachments: payload.files || [],
          projectId: action.projectId
        }
      });
      if (res && res.success) {
        return ok('queued', res, `Adicionado à fila (posição ${res.position || '—'}).`);
      }
      throw new Error(res?.error || 'Não foi possível adicionar à fila.');
    },

    async REORDER_QUEUE({ id, index }) {
      const res = await chrome.runtime.sendMessage({
        action: 'SUPER_LOVABLE_QUEUE_MOVE',
        data: { id, index }
      });
      if (res && res.success) return ok();
      throw new Error(res?.error || 'Não foi possível mover o item.');
    },

    async EXPORT_HISTORY() {
      const items = root.HistoryManager.items.map((i) => ({
        id: i.id,
        projectId: i.project || null,
        actionName: i.actionName || 'SEND_PROMPT',
        actionType: i.actionType || 'chat',
        requestText: i.text,
        status: i.status,
        createdAt: i.date,
        durationMs: i.durationMs,
        errorMessage: i.error || undefined,
        favorite: !!i.favorite,
      }));
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({ url, filename: 'super-lovable-historico.json' });
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return ok('completed', { total: items.length }, `${items.length} registros exportados.`);
    },

    async COPY_TEXT({ text }) {
      await navigator.clipboard.writeText(text || '');
      return ok('completed', null, 'Copiado.');
    },

    async SAVE_SETTINGS({ patch }) {
      await root.SettingsManager.set(patch || {});
      return ok('completed', null, 'Configurações salvas.');
    },

    async EXPORT_SETTINGS() {
      const json = root.SettingsManager.export();
      await navigator.clipboard.writeText(json).catch(() => {});
      return ok('completed', { json }, 'Configurações copiadas.');
    },

    async RUN_SHORTCUT({ shortcut }) {
      return ok('completed', { text: (shortcut && shortcut.text) || '' });
    },

    async TOGGLE_SOUNDS({ value }) {
      await root.SettingsManager.set({ sounds: !!value });
      return ok();
    },

    async TOGGLE_NOTIFICATIONS({ value }) {
      await root.SettingsManager.set({ notifications: !!value });
      return ok();
    },

    async TOGGLE_SHIELD({ value }) {
      const active = await root.ShieldManager.toggle(value);
      return ok('completed', { active });
    },

    async CLEAR_DIAGNOSTICS() {
      await root.RuntimeTraceManager.clear();
      return ok('completed', null, 'Diagnóstico limpo.');
    },
  };

  const LocalActionManager = {
    supports(name) { return !!HANDLERS[name]; },
    async execute(action) {
      const handler = HANDLERS[action.name];
      if (!handler) {
        return { success: false, type: 'local', status: 'unsupported', code: 'LOCAL_ACTION_UNAVAILABLE', message: 'Esta ação local não existe.' };
      }
      try {
        return await handler(action.payload || {}, action);
      } catch (e) {
        return fail('LOCAL_ACTION_FAILED', e.message);
      }
    },
  };

  root.LocalActionManager = LocalActionManager;
})(typeof self !== 'undefined' ? self : globalThis);
