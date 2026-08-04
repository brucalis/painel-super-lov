/* project-secrets-manager.js — variáveis protegidas do projeto.
 * O valor nunca é exibido, registrado, guardado no frontend, no histórico
 * ou em telemetria. Só habilita quando existir mecanismo autorizado.
 */
(function (root) {
  const NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
  const MAX_VALUE = 8192;
  const UNAVAILABLE = 'O gerenciamento nativo de secrets não está disponível neste projeto.';

  function headers() {
    return root.LCA && typeof root.LCA.apiHeaders === 'function' ? root.LCA.apiHeaders() : null;
  }

  function validate({ name, value }) {
    if (!name) return 'Informe o nome da variável.';
    if (!NAME_RE.test(name)) return 'Use apenas letras maiúsculas, números e underline (ex.: MINHA_CHAVE).';
    if (!value) return 'Informe o valor da variável.';
    if (value.length > MAX_VALUE) return 'Valor muito grande para uma variável protegida.';
    return null;
  }

  const ProjectSecretsManager = {
    UNAVAILABLE,
    validate,

    async isAvailable(projectId) {
      if (!(await root.FeatureFlags.isEnabled('nativeSecrets'))) return false;
      if (!projectId) return false;
      const h = headers();
      if (!h) return false;
      try {
        const res = await fetch(`https://api.lovable.dev/projects/${projectId}/secrets`, {
          headers: h,
          credentials: 'include',
        });
        if (res.status === 401 || res.status === 403) {
          await root.LovableSessionContext.invalidate('auth');
          return false;
        }
        return res.ok;
      } catch (e) {
        return false;
      }
    },

    /** Lista apenas nomes. O valor jamais retorna para a interface. */
    async list(projectId) {
      if (!(await ProjectSecretsManager.isAvailable(projectId))) return { available: false, names: [] };
      try {
        const res = await fetch(`https://api.lovable.dev/projects/${projectId}/secrets`, {
          headers: headers(),
          credentials: 'include',
        });
        if (!res.ok) return { available: false, names: [] };
        const data = await res.json().catch(() => ({}));
        const arr = Array.isArray(data) ? data : data.secrets || data.items || [];
        return { available: true, names: arr.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean) };
      } catch (e) {
        return { available: false, names: [] };
      }
    },

    async save(projectId, { name, value }) {
      const err = validate({ name, value });
      if (err) return { saved: false, message: err };
      if (!(await ProjectSecretsManager.isAvailable(projectId))) return { saved: false, message: UNAVAILABLE };
      try {
        const res = await fetch(`https://api.lovable.dev/projects/${projectId}/secrets`, {
          method: 'POST',
          headers: headers(),
          credentials: 'include',
          body: JSON.stringify({ name, value }),
        });
        root.LovableUsageState.fromResponse({ httpStatus: res.status, body: '', source: 'secrets' });
        if (!res.ok) {
          if (res.status === 404) await root.FeatureFlags.disable('nativeSecrets', 'endpoint 404');
          return { saved: false, message: `Não foi possível salvar (${res.status}).` };
        }
        return { saved: true, message: `${name} — configurada` };
      } catch (e) {
        // A mensagem nunca inclui o valor informado.
        return { saved: false, message: 'Falha de rede ao salvar a variável.' };
      }
    },
  };

  root.ProjectSecretsManager = ProjectSecretsManager;
})(typeof self !== 'undefined' ? self : globalThis);
