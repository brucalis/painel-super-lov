// storage-manager.js — camada única de acesso a chrome.storage.
// Nunca persiste cookies, tokens ou cabeçalhos de autenticação.
(function () {
  const SENSITIVE = ['cookie', 'cookiestring', 'authorization', 'token', 'bearer', 'authtoken'];

  function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (SENSITIVE.includes(k.toLowerCase())) continue;
        out[k] = scrub(v);
      }
      return out;
    }
    return value;
  }

  const local = {
    async get(key, fallback = null) {
      try {
        const r = await chrome.storage.local.get(key);
        return r[key] === undefined ? fallback : r[key];
      } catch (e) {
        console.warn('storage.local.get', e);
        return fallback;
      }
    },
    async set(key, value) {
      try {
        await chrome.storage.local.set({ [key]: scrub(value) });
        return true;
      } catch (e) {
        console.warn('storage.local.set', e);
        return false;
      }
    },
    async remove(key) {
      try {
        await chrome.storage.local.remove(key);
      } catch (e) {
        console.warn('storage.local.remove', e);
      }
    },
  };

  const session = {
    async get(key, fallback = null) {
      try {
        if (!chrome.storage.session) return fallback;
        const r = await chrome.storage.session.get(key);
        return r[key] === undefined ? fallback : r[key];
      } catch (e) {
        return fallback;
      }
    },
    async set(key, value) {
      try {
        if (!chrome.storage.session) return false;
        await chrome.storage.session.set({ [key]: scrub(value) });
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  window.StorageManager = { local, session, scrub, KEYS: {
    settings: 'lca_settings',
    queue: 'lca_queue',
    history: 'lca_history',
    shortcuts: 'lca_shortcuts',
    models: 'lca_model_by_project',
    shield: 'lca_shield',
  } };
})();
