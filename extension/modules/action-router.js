/* action-router.js — ponto único de entrada de qualquer ação da SUPER LOVABLE.
 * Responsável por decidir como cada ação deve ser executada.
 */
(function (root) {
  const ACTION_TYPES = {
    LOCAL: 'local',
    NATIVE: 'native',
    CHAT: 'chat',
  };

  function trace(actionName, actionType, status, extra = {}) {
    if (!root.RuntimeTraceManager) return;
    void root.RuntimeTraceManager.record({ actionName, actionType, status, ...extra });
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
    } catch (e) {
      /* histórico nunca derruba a ação */
    }
  }

  const ActionRouter = {
    /** Método principal de execução seguindo o contrato solicitado. */
    async execute(action) {
      const startedAt = Date.now();
      const def = root.ActionRegistry.get(action.name);

      if (!def) {
        return {
          success: false,
          type: action.type || 'unknown',
          status: 'unsupported',
          code: 'UNKNOWN_ACTION_TYPE',
          message: 'Tipo de ação não reconhecido.',
        };
      }

      trace(action.name, action.type, 'running', { projectId: action.projectId });

      let result;
      switch (action.type) {
        case ACTION_TYPES.LOCAL:
          result = await root.LocalActionManager.execute(action);
          break;

        case ACTION_TYPES.NATIVE:
          result = await root.LovableNativeBridge.execute(action);
          break;

        case ACTION_TYPES.CHAT:
          result = await root.LovableChatAdapter.execute(action);
          break;

        default:
          result = {
            success: false,
            type: action.type,
            status: 'unsupported',
            code: 'UNKNOWN_ACTION_TYPE',
            message: 'Tipo de ação não reconhecido.',
          };
      }

      // Adiciona nota de quota se a ação falhar e for do tipo chat
      if (!result.success && root.LovableUsageState && result.type === 'chat') {
        const note = root.LovableUsageState.message();
        if (note) result.message = note;
      }

      trace(action.name, result.type, result.status, {
        durationMs: Date.now() - startedAt,
        projectId: action.projectId,
        errorCode: result.success ? undefined : result.code,
      });

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
