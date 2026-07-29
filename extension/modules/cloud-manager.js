// cloud-manager.js — criação de projeto e Lovable Cloud.
// Nunca ativa nada automaticamente e nunca simula sucesso.
(function () {
  const CloudManager = {
    /** Criação de projeto: só usa endpoint legítimo se ele responder; senão, fluxo manual. */
    async createProject({ name, description, initialPrompt, blank }) {
      const LCA = window.LCA;
      if (!LCA.authToken) throw new Error(window.I18n.t('err_session'));
      const body = { name, description, prompt: blank ? '' : initialPrompt || '' };
      try {
        const res = await fetch('https://api.lovable.dev/projects', {
          method: 'POST',
          headers: LCA.apiHeaders(),
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { created: true, project: data };
        }
        return { created: false, status: res.status };
      } catch (e) {
        return { created: false, error: e.message };
      }
    },
    async fallbackCreate(promptText) {
      try { await navigator.clipboard.writeText(promptText || ''); } catch (e) { /* noop */ }
      await chrome.tabs.create({ url: 'https://lovable.dev/projects/new' });
      return 'Prompt copiado. Cole na página oficial de criação que acabou de abrir.';
    },

    /** Verifica o estado do Cloud antes de qualquer ação. */
    async checkCloud() {
      const LCA = window.LCA;
      if (!LCA.projectId) throw new Error(window.I18n.t('err_project'));
      if (!LCA.authToken) throw new Error(window.I18n.t('err_session'));
      const urls = [
        `https://api.lovable.dev/projects/${LCA.projectId}/integrations`,
        `https://api.lovable.dev/projects/${LCA.projectId}`,
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, { headers: LCA.apiHeaders(), credentials: 'include' });
          if (!res.ok) continue;
          const data = await res.json().catch(() => ({}));
          const raw = JSON.stringify(data).toLowerCase();
          return {
            available: true,
            enabled: raw.includes('supabase') || raw.includes('"cloud"'),
            source: url,
          };
        } catch (e) {
          console.warn('checkCloud', e);
        }
      }
      return { available: false, enabled: false };
    },

    /** Ativação só acontece por clique explícito e via o fluxo de chat já existente. */
    cloudPrompt() {
      return 'Ative o Lovable Cloud neste projeto e explique exatamente o que será criado (banco de dados, autenticação e funções), sem alterar funcionalidades existentes.';
    },
  };

  window.CloudManager = CloudManager;
})();
