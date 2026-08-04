/* lovable-cloud-manager.js — leitura de estado e ativação do Lovable Cloud
 * usando somente o que a conta já autoriza. Nunca ativa sozinho e nunca
 * declara "ativado" sem confirmação real da plataforma.
 */
(function (root) {
  const STATUSES = ['not-enabled', 'enabling', 'ready', 'error', 'unavailable'];

  function headers() {
    return root.LCA && typeof root.LCA.apiHeaders === 'function' ? root.LCA.apiHeaders() : null;
  }

  const LovableCloudManager = {
    STATUSES,

    async getStatus(projectId) {
      if (!projectId) return { status: 'unavailable', message: 'Nenhum projeto sincronizado.' };
      const h = headers();
      if (!h) return { status: 'unavailable', message: 'Sessão da Lovable indisponível.' };
      const urls = [
        `https://api.lovable.dev/projects/${projectId}/integrations`,
        `https://api.lovable.dev/projects/${projectId}`,
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, { headers: h, credentials: 'include' });
          if (!res.ok) continue;
          const data = await res.json().catch(() => ({}));
          const raw = JSON.stringify(data).toLowerCase();
          const ready = raw.includes('supabase') || raw.includes('"cloud"');
          return {
            status: ready ? 'ready' : 'not-enabled',
            hasDatabase: raw.includes('supabase'),
            hasAuth: raw.includes('auth'),
            hasStorage: raw.includes('storage'),
          };
        } catch (e) { /* tenta o próximo */ }
      }
      return { status: 'unavailable', message: 'Não foi possível consultar o Lovable Cloud deste projeto.' };
    },

    describe(status) {
      switch (status.status) {
        case 'ready': return 'Lovable Cloud ativo neste projeto.';
        case 'not-enabled': return 'Lovable Cloud ainda não está ativo neste projeto.';
        case 'enabling': return 'Ativação do Lovable Cloud em andamento.';
        default: return status.message || 'Estado do Lovable Cloud indisponível.';
      }
    },

    /** Ativação só ocorre por clique explícito do usuário. */
    async enable(projectId, { confirmed } = {}) {
      if (!confirmed) {
        return {
          status: 'not-enabled',
          requiresConfirmation: true,
          message: 'A ativação cria banco de dados, autenticação e funções no projeto. Confirme para continuar.',
        };
      }
      if (!(await root.FeatureFlags.isEnabled('nativeCloud'))) {
        return { status: 'unavailable', message: 'A ativação nativa do Lovable Cloud não está disponível.' };
      }
      try {
        const res = await fetch(`https://api.lovable.dev/projects/${projectId}/integrations/cloud`, {
          method: 'POST',
          headers: headers(),
          credentials: 'include',
          body: JSON.stringify({ enable: true }),
        });
        const text = await res.text();
        root.LovableUsageState.fromResponse({ httpStatus: res.status, body: text, source: 'cloud' });
        if (res.status === 404 || res.status === 405) {
          await root.FeatureFlags.disable('nativeCloud', `cloud ${res.status}`);
          return { status: 'unavailable', message: 'Esta conta não expõe a ativação automática do Lovable Cloud.' };
        }
        if (!res.ok) return { status: 'error', message: `A Lovable respondeu ${res.status} à ativação.` };
        const after = await LovableCloudManager.getStatus(projectId);
        return after.status === 'ready'
          ? { status: 'ready', message: 'Lovable Cloud ativo neste projeto.' }
          : { status: 'enabling', message: 'Ativação solicitada. Acompanhe na própria Lovable.' };
      } catch (e) {
        return { status: 'error', message: e.message };
      }
    },
  };

  root.LovableCloudManager = LovableCloudManager;
})(typeof self !== 'undefined' ? self : globalThis);
