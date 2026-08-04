/* deployment-manager.js — publicação/deployment por operação nativa autorizada.
 * Só ativa quando a feature flag `nativeDeployment` estiver ligada E a conta
 * expuser a operação. Nunca simula URL nem sucesso.
 */
(function (root) {
  const STATUS = ['preparing', 'queued', 'building', 'publishing', 'completed', 'failed', 'unavailable'];

  function unavailable(message) {
    return { status: 'unavailable', message: message || 'A publicação nativa não está disponível neste projeto.' };
  }

  function headers() {
    return root.LCA && typeof root.LCA.apiHeaders === 'function' ? root.LCA.apiHeaders() : null;
  }

  function normalize(data) {
    const raw = JSON.stringify(data || {}).toLowerCase();
    if (raw.includes('"failed"') || raw.includes('"error"')) return 'failed';
    if (raw.includes('"completed"') || raw.includes('"ready"') || raw.includes('"success"')) return 'completed';
    if (raw.includes('"publishing"')) return 'publishing';
    if (raw.includes('"building"')) return 'building';
    if (raw.includes('"queued"') || raw.includes('"pending"')) return 'queued';
    return 'preparing';
  }

  const DeploymentManager = {
    STATUS,

    async isAvailable(projectId) {
      if (!(await root.FeatureFlags.isEnabled('nativeDeployment'))) return false;
      if (!projectId) return false;
      const h = headers();
      if (!h) return false;
      try {
        const res = await fetch(`https://api.lovable.dev/projects/${projectId}/deployments`, {
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

    async createDeployment(projectId) {
      if (!(await DeploymentManager.isAvailable(projectId))) return unavailable();
      try {
        const res = await fetch(`https://api.lovable.dev/projects/${projectId}/deployments`, {
          method: 'POST',
          headers: headers(),
          credentials: 'include',
          body: JSON.stringify({}),
        });
        const text = await res.text();
        root.LovableUsageState.fromResponse({ httpStatus: res.status, body: text, source: 'deployment' });
        if (!res.ok) {
          await root.FeatureFlags.disable('nativeDeployment', `deploy ${res.status}`);
          return { status: 'failed', message: `A Lovable respondeu ${res.status} ao pedido de publicação.` };
        }
        let data = {};
        try { data = JSON.parse(text); } catch (e) { data = {}; }
        return {
          status: normalize(data),
          deploymentId: data.id || data.deployment_id || null,
          url: data.url || data.deployment_url || null,
        };
      } catch (e) {
        return { status: 'failed', message: e.message };
      }
    },

    async getDeploymentStatus(projectId, deploymentId) {
      if (!deploymentId) return unavailable();
      try {
        const res = await fetch(`https://api.lovable.dev/projects/${projectId}/deployments/${deploymentId}`, {
          headers: headers(),
          credentials: 'include',
        });
        if (!res.ok) return { status: 'failed', message: `Consulta respondeu ${res.status}.` };
        const data = await res.json().catch(() => ({}));
        return { status: normalize(data), url: data.url || data.deployment_url || null };
      } catch (e) {
        return { status: 'failed', message: e.message };
      }
    },

    /** Acompanha até um estado final, sem loop infinito. */
    async waitForDeployment(projectId, deploymentId, onProgress, { maxChecks = 30, intervalMs = 4000 } = {}) {
      for (let i = 0; i < maxChecks; i++) {
        const st = await DeploymentManager.getDeploymentStatus(projectId, deploymentId);
        if (typeof onProgress === 'function') onProgress(st);
        if (st.status === 'completed' || st.status === 'failed' || st.status === 'unavailable') return st;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return { status: 'failed', message: 'A publicação demorou mais que o esperado. Verifique na própria Lovable.' };
    },
  };

  root.DeploymentManager = DeploymentManager;
})(typeof self !== 'undefined' ? self : globalThis);
