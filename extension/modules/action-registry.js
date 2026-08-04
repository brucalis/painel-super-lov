/* action-registry.js — fonte única de verdade da classificação das ações.
 * local  = resolvida inteiramente pela extensão
 * native = recurso legítimo já disponível ao projeto/conta
 * chat   = exige interpretação e geração pela Lovable
 */
(function (root) {
  const ACTION_TYPES = {
    LOCAL: 'local',
    NATIVE: 'native',
    CHAT: 'chat',
  };

  const ACTION_REGISTRY = {
    // ---------------- LOCAIS ----------------
    IMPROVE_PROMPT: { type: 'local', handler: 'promptEnhancer', label: 'Melhorar prompt' },
    ADD_TO_QUEUE: { type: 'local', handler: 'queue', label: 'Adicionar à fila' },
    REORDER_QUEUE: { type: 'local', handler: 'queue', label: 'Reorganizar fila' },
    EXPORT_HISTORY: { type: 'local', handler: 'history', label: 'Exportar histórico' },
    COPY_TEXT: { type: 'local', handler: 'clipboard', label: 'Copiar texto' },
    SAVE_SETTINGS: { type: 'local', handler: 'settings', label: 'Salvar configurações' },
    EXPORT_SETTINGS: { type: 'local', handler: 'settings', label: 'Exportar configurações' },
    RUN_SHORTCUT: { type: 'local', handler: 'shortcuts', label: 'Executar atalho' },
    TOGGLE_SOUNDS: { type: 'local', handler: 'settings', label: 'Sons' },
    TOGGLE_NOTIFICATIONS: { type: 'local', handler: 'settings', label: 'Notificações' },
    TOGGLE_SHIELD: { type: 'local', handler: 'shield', label: 'Escudo' },
    CLEAR_DIAGNOSTICS: { type: 'local', handler: 'trace', label: 'Limpar diagnóstico' },

    // ---------------- NATIVAS ----------------
    DOWNLOAD_PROJECT: { type: 'native', handler: 'projectFiles', flag: 'nativeDownload', label: 'Baixar projeto' },
    GET_PROJECT_CONTEXT: { type: 'native', handler: 'projectContext', label: 'Recarregar contexto' },
    CREATE_PROJECT: { type: 'native', handler: 'projectCreation', flag: 'nativeProjectCreation', label: 'Criar projeto' },
    CHECK_CLOUD: { type: 'native', handler: 'cloud', flag: 'nativeCloud', label: 'Verificar Lovable Cloud' },
    ENABLE_CLOUD: { type: 'native', handler: 'cloud', flag: 'nativeCloud', label: 'Ativar Lovable Cloud' },
    PUBLISH_PROJECT: { type: 'native', handler: 'deployment', flag: 'nativeDeployment', label: 'Publicar projeto' },
    MANAGE_SECRET: { type: 'native', handler: 'secrets', flag: 'nativeSecrets', label: 'Gerenciar secrets' },
    REMOVE_WATERMARK: { type: 'native', handler: 'watermark', flag: 'nativeWatermark', label: 'Remover marca' },

    // ---------------- CHAT ----------------
    SEND_PROMPT: { type: 'chat', handler: 'chat', label: 'Enviar prompt' },
    CREATE_FEATURE: { type: 'chat', handler: 'chat', label: 'Criar funcionalidade' },
    UPDATE_INTERFACE: { type: 'chat', handler: 'chat', label: 'Alterar interface' },
    FIX_APPLICATION_LOGIC: { type: 'chat', handler: 'chat', label: 'Corrigir lógica' },
  };

  const ActionRegistry = {
    ACTION_TYPES,
    ACTION_REGISTRY,
    get(name) { return ACTION_REGISTRY[name] || null; },
    typeOf(name) { return (ACTION_REGISTRY[name] || {}).type || null; },
    flagOf(name) { return (ACTION_REGISTRY[name] || {}).flag || null; },
    labelOf(name) { return (ACTION_REGISTRY[name] || {}).label || name; },
    list(type) {
      return Object.entries(ACTION_REGISTRY)
        .filter(([, def]) => !type || def.type === type)
        .map(([name, def]) => ({ name, ...def }));
    },
    /** Cria um objeto de ação já no contrato oficial. */
    create(name, payload = {}, projectId = null) {
      const def = ACTION_REGISTRY[name];
      return {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        type: def ? def.type : 'unknown',
        payload,
        projectId: projectId || undefined,
        createdAt: Date.now(),
      };
    },
  };

  root.ActionRegistry = ActionRegistry;
  root.ACTION_TYPES = ACTION_TYPES;
  root.ACTION_REGISTRY = ACTION_REGISTRY;
})(typeof self !== 'undefined' ? self : globalThis);
