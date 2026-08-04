/* lovable-chat-adapter.js — adaptador para ações que exigem o chat da Lovable.
 * Responsável por formatar e enviar pedidos que precisam de IA.
 */
(function (root) {
  const LovableChatAdapter = {
    async execute(action) {
      const payload = action.payload || {};
      const text = payload.text || '';

      if (!text.trim() && (!payload.attachments || payload.attachments.length === 0)) {
        return {
          success: false,
          type: 'chat',
          status: 'failed',
          code: 'EMPTY_PROMPT',
          message: 'Escreva o que deseja antes de enviar.',
        };
      }

      try {
        const res = await chrome.runtime.sendMessage({
          action: 'SUPER_LOVABLE_SUBMIT_PROMPT',
          data: {
            text,
            projectId: action.projectId || null,
            attachments: payload.attachments || payload.files || [],
            source: payload.source || 'popup',
            mode: payload.mode,
            model: payload.model,
          },
        });

        if (!res || !res.success) {
          const message = (res && res.error) || 'Não foi possível enviar para a Lovable.';
          return {
            success: false,
            type: 'chat',
            status: res && res.blocked ? 'blocked' : 'failed',
            code: 'CHAT_SEND_FAILED',
            message,
            canRetry: true,
          };
        }

        return {
          success: true,
          type: 'chat',
          status: res.queued ? 'queued' : 'completed',
          data: res,
          message: res.queued ? `Na fila (posição ${res.position || '—'}).` : 'Enviado para a Lovable.',
        };
      } catch (e) {
        return {
          success: false,
          type: 'chat',
          status: 'failed',
          code: 'CHAT_SEND_FAILED',
          message: e.message,
          canRetry: true,
        };
      }
    },
  };

  root.LovableChatAdapter = LovableChatAdapter;
})(typeof self !== 'undefined' ? self : globalThis);
