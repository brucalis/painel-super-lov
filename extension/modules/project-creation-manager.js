/* project-creation-manager.js — criação de projeto pelo fluxo autorizado da conta.
 * Não cria contas, não troca workspace sem autorização e não contorna limites.
 */
(function (root) {
  const ERRORS = {
    PROJECT_LIMIT_REACHED: 'A conta atingiu o limite de projetos.',
    RATE_LIMITED: 'A Lovable pediu para aguardar antes de criar outro projeto.',
    SESSION_EXPIRED: 'Não foi possível validar sua sessão da Lovable. Recarregue o projeto e tente novamente.',
    WORKSPACE_REQUIRED: 'Selecione um workspace válido antes de criar o projeto.',
    CREATION_UNAVAILABLE: 'A criação nativa de projeto não está disponível nesta conta.',
  };

  function classify(status, text) {
    if (status === 401 || status === 403) return 'SESSION_EXPIRED';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 402) return 'PROJECT_LIMIT_REACHED';
    if (/limit/i.test(text || '')) return 'PROJECT_LIMIT_REACHED';
    if (/workspace/i.test(text || '')) return 'WORKSPACE_REQUIRED';
    return 'CREATION_UNAVAILABLE';
  }

  const ProjectCreationManager = {
    ERRORS,

    async create(input = {}) {
      if (!(await root.FeatureFlags.isEnabled('nativeProjectCreation'))) {
        return { created: false, code: 'CREATION_UNAVAILABLE', message: ERRORS.CREATION_UNAVAILABLE };
      }
      const ctx = await root.LovableSessionContext.refresh();
      if (!ctx.authenticated) {
        return { created: false, code: 'SESSION_EXPIRED', message: ERRORS.SESSION_EXPIRED };
      }
      const headers = root.LCA && root.LCA.apiHeaders ? root.LCA.apiHeaders() : null;
      if (!headers) return { created: false, code: 'SESSION_EXPIRED', message: ERRORS.SESSION_EXPIRED };

      const body = {
        name: input.name,
        description: input.description || '',
        prompt: input.blank ? '' : input.initialPrompt || '',
      };
      if (input.workspaceId || ctx.workspaceId) body.workspace_id = input.workspaceId || ctx.workspaceId;

      try {
        const res = await fetch('https://api.lovable.dev/projects', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const text = await res.text();
        root.LovableUsageState.fromResponse({ httpStatus: res.status, body: text, source: 'project-creation' });
        if (res.ok) {
          let data = {};
          try { data = JSON.parse(text); } catch (e) { data = {}; }
          return { created: true, project: data, projectId: data.id || data.project_id || null };
        }
        const code = classify(res.status, text);
        if (code === 'CREATION_UNAVAILABLE') {
          await root.FeatureFlags.disable('nativeProjectCreation', `create ${res.status}`);
        }
        return { created: false, code, message: ERRORS[code], canRetry: code === 'RATE_LIMITED' ? false : code === 'SESSION_EXPIRED' };
      } catch (e) {
        return { created: false, code: 'CREATION_UNAVAILABLE', message: ERRORS.CREATION_UNAVAILABLE };
      }
    },

    /** Fallback permitido: copiar o prompt e abrir a página oficial. */
    async fallback(promptText) {
      try { await navigator.clipboard.writeText(promptText || ''); } catch (e) { /* noop */ }
      await chrome.tabs.create({ url: 'https://lovable.dev/projects/new' });
      return 'Prompt copiado. Cole na página oficial de criação que acabou de abrir.';
    },
  };

  root.ProjectCreationManager = ProjectCreationManager;
})(typeof self !== 'undefined' ? self : globalThis);
