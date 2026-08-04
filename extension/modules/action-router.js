/* action-router.js — ponto único de entrada de qualquer ação da SUPER LOVABLE.
 * Ordem obrigatória: LOCAL -> NATIVO -> CHAT (apenas quando faz sentido).
 * Nunca envia prompt de chat para ação local ou nativa disponível.
 */
(function (root) {
  const CHAT_ONLY = new Set(['SEND_PROMPT', 'CREATE_FEATURE', 'UPDATE_INTERFACE', 'FIX_APPLICATION_LOGIC']);

  function trace(evt, data) {
    if (root.RuntimeTraceManager) root.RuntimeTraceManager.log(evt, data);
  }

  async function runChat(action) {
    const payload = action.payload || {};
    const text = payload.text || '';
    if (!text.trim()) {
      return { success: false, type: 'chat', status: 'failed', code: 'EMPTY_PROMPT', message: 'Escreva o que deseja antes de enviar.' };
    }
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'SUPER_LOVABLE_SUBMIT_PROMPT',
        data: { text, projectId: action.projectId || null, attachments: payload.files || [], source: payload.source || 'popup' },
      });
      if (!res || !res.success) {
        const message = (res && res.error) || 'Não foi possível enviar para a Lovable.';
        return { success: false, type: 'chat', status: res && res.blocked ? 'blocked' : 'failed', code: 'CHAT_SEND_FAILED', message, canRetry: true };
      }
      return {
        success: true,
        type: 'chat',
        status: res.queued ? 'queued' : 'completed',
        data: res,
        message: res.queued ? `Na fila (posição ${res.position || '—'}).` : 'Enviado para a Lovable.',
      };
    } catch (e) {
      return { success: false, type: 'chat', status: 'failed', code: 'CHAT_SEND_FAILED', message: e.message, canRetry: true };
    }
  }

  async function record(action, result, startedAt) {
    if (!root.HistoryManager || !root.HistoryManager.add) return;
    try {
      await root.HistoryManager.add({
        text: (action.payload && action.payload.text) || root.ActionRegistry.labelOf(action.name),
        project: action.projectId || null,
        actionName: action.name,
        actionType: result.type,
        status: result.status,
        error: result.success ? null : result.message || null,
        durationMs: Date.now() - startedAt,
        origin: 'action-router',
      });
    } catch (e) { /* histórico nunca derruba a ação */ }
  }

  const ActionRouter = {
    /** Decide, sem executar, qual caminho a ação seguirá. */
    async resolve(name) {
      const def = root.ActionRegistry.get(name);
      if (!def) return { type: 'unknown', reason: 'Ação desconhecida.' };
      if (def.type === 'local') return { type: 'local' };
      if (def.type === 'native') {
        const supported = await root.LovableNativeBridge.supports(name);
        return supported ? { type: 'native' } : { type: 'unsupported', reason: 'Recurso indisponível na conta ou projeto atual.' };
      }
      return { type: 'chat' };
    },

    async execute(action) {
      const startedAt = Date.now();
      const def = root.ActionRegistry.get(action.name);
      if (!def) {
        return { success: false, type: 'unknown', status: 'unsupported', code: 'UNKNOWN_ACTION', message: 'Ação desconhecida.' };
      }
      trace('action:start', { name: action.name, type: def.type });

      let result;
      if (def.type === 'local') {
        result = await root.LocalActionManager.execute(action);
      } else if (def.type === 'native') {
        result = await root.LovableNativeBridge.execute(action);
        // Fallback para o chat só quando o recurso nativo não existe E a ação
        // é do tipo que a Lovable realmente consegue interpretar por prompt.
        if (!result.success && result.status === 'unsupported' && action.payload && action.payload.chatFallbackText) {
          trace('action:fallback-chat', { name: action.name });
          const chat = await runChat({ ...action, payload: { ...action.payload, text: action.payload.chatFallbackText } });
          chat.fallbackFrom = action.name;
          chat.message = `${result.message} ${chat.message}`;
          result = chat;
        }
      } else if (CHAT_ONLY.has(action.name)) {
        result = await runChat(action);
      } else {
        result = { success: false, type: 'unknown', status: 'unsupported', code: 'UNKNOWN_ACTION', message: 'Ação desconhecida.' };
      }

      if (!result.success && root.LovableUsageState) {
        const note = root.LovableUsageState.message();
        if (note && result.type === 'chat') result.message = note;
      }

      trace('action:end', { name: action.name, type: result.type, status: result.status, ok: result.success });
      await record(action, result, startedAt);
      return result;
    },

    /** Atalho: monta e executa em uma chamada. */
    async run(name, payload = {}, projectId = null) {
      return ActionRouter.execute(root.ActionRegistry.create(name, payload, projectId));
    },
  };

  root.ActionRouter = ActionRouter;
})(typeof self !== 'undefined' ? self : globalThis);
