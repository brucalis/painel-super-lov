/* lovable-session-context.js — estado real da sessão e do projeto da Lovable.
 * Nunca cria usuário, sessão, workspace ou projectId. Apenas observa.
 */
(function (root) {
  const SESSION_KEY = 'super_lovable_context';

  const STATUS = {
    UNAVAILABLE: 'unavailable',
    NO_PROJECT: 'no-project',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    EXPIRED: 'session-expired',
    ERROR: 'error',
  };

  let context = {
    available: false,
    authenticated: false,
    projectId: null,
    workspaceId: null,
    projectUrl: null,
    tabId: null,
    lastUpdatedAt: 0,
  };
  let status = STATUS.UNAVAILABLE;
  const listeners = [];

  function extractProjectId(url) {
    if (!url) return null;
    const m = String(url).match(/\/projects\/([0-9a-zA-Z-]+)/);
    return m ? m[1] : null;
  }

  function extractWorkspaceId(url) {
    if (!url) return null;
    const m = String(url).match(/\/(?:workspaces|teams|orgs)\/([0-9a-zA-Z-]+)/);
    return m ? m[1] : null;
  }

  async function findLovableTab() {
    try {
      const active = await chrome.tabs.query({ active: true, currentWindow: true });
      const candidate = active.find((t) => t.url && /https:\/\/(?:[a-z0-9-]+\.)?lovable\.dev\//.test(t.url));
      if (candidate) return candidate;
      const all = await chrome.tabs.query({ url: ['https://lovable.dev/*', 'https://*.lovable.dev/*'] });
      return all.find((t) => extractProjectId(t.url)) || all[0] || null;
    } catch (e) {
      return null;
    }
  }

  async function hasSession() {
    try {
      const cookies = await chrome.cookies.getAll({ domain: 'lovable.dev' });
      return cookies.some((c) => c.name === 'sb-access-token' || c.name === 'lovable-session-id-v2');
    } catch (e) {
      return false;
    }
  }

  async function persist() {
    // Dados voláteis ficam na sessão do navegador, nunca no armazenamento permanente.
    try {
      if (chrome.storage.session) await chrome.storage.session.set({ [SESSION_KEY]: context });
    } catch (e) { /* storage.session pode não existir em versões antigas */ }
  }

  function emit() {
    listeners.forEach((fn) => { try { fn(context, status); } catch (e) { console.warn(e); } });
  }

  const LovableSessionContext = {
    STATUS,
    get context() { return { ...context }; },
    get status() { return status; },
    extractProjectId,

    onChange(fn) { if (typeof fn === 'function') listeners.push(fn); },

    async refresh() {
      const previous = { ...context };
      status = STATUS.CONNECTING;
      try {
        const tab = await findLovableTab();
        const authenticated = await hasSession();
        const projectId = extractProjectId(tab && tab.url);

        context = {
          available: !!tab,
          authenticated,
          projectId: projectId || null,
          workspaceId: extractWorkspaceId(tab && tab.url),
          projectUrl: (tab && tab.url) || null,
          tabId: (tab && tab.id) || null,
          lastUpdatedAt: Date.now(),
        };

        if (!tab) status = STATUS.UNAVAILABLE;
        else if (!authenticated) status = STATUS.EXPIRED;
        else if (!projectId) status = STATUS.NO_PROJECT;
        else status = STATUS.CONNECTED;

        if (previous.projectId && projectId && previous.projectId !== projectId) {
          LovableSessionContext.lastProjectChange = { from: previous.projectId, to: projectId, at: Date.now() };
        }
      } catch (e) {
        status = STATUS.ERROR;
        context = { ...context, available: false, lastUpdatedAt: Date.now() };
      }
      await persist();
      emit();
      return { ...context };
    },

    async get({ maxAgeMs = 5000 } = {}) {
      if (Date.now() - context.lastUpdatedAt > maxAgeMs) return LovableSessionContext.refresh();
      return { ...context };
    },

    /** Invalida o contexto temporário após 401/403 ou logout. */
    async invalidate(reason = 'session') {
      context = { ...context, authenticated: false, lastUpdatedAt: 0 };
      status = reason === 'logout' ? STATUS.UNAVAILABLE : STATUS.EXPIRED;
      try {
        if (chrome.storage.session) await chrome.storage.session.remove(SESSION_KEY);
      } catch (e) { /* noop */ }
      emit();
    },

    describe() {
      switch (status) {
        case STATUS.CONNECTED: return 'Projeto conectado.';
        case STATUS.NO_PROJECT: return 'Abra um projeto na Lovable para usar as ações nativas.';
        case STATUS.EXPIRED: return 'Não foi possível validar sua sessão da Lovable. Recarregue o projeto e tente novamente.';
        case STATUS.CONNECTING: return 'Conectando ao projeto…';
        case STATUS.ERROR: return 'Não foi possível ler o contexto da Lovable.';
        default: return 'Nenhuma aba da Lovable aberta.';
      }
    },
  };

  root.LovableSessionContext = LovableSessionContext;
})(typeof self !== 'undefined' ? self : globalThis);
