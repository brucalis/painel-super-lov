// settings-manager.js — preferências persistentes da extensão
(function () {
  const KEY = 'lca_settings';
  const DEFAULTS = {
    sounds: true,
    notifications: false,
    shield: false,
    queueInterval: 5,
    queueCompletionMode: 'timer', // timer | manual
    historyLimit: 500,
    defaultMode: 'clareza',
    defaultModel: 'auto',
    language: 'pt',
    confirmBeforeSend: false,
    confirmDeletions: true,
    maxFiles: 10,
    maxFileMb: 25,
    maxTotalMb: 75,
    transcriptionEndpoint: '',
    enhancerEndpoint: '',
  };

  let cache = { ...DEFAULTS };
  const listeners = [];

  const SettingsManager = {
    get all() { return { ...cache }; },
    get(k) { return cache[k]; },
    defaults: DEFAULTS,
    async load() {
      const stored = await window.StorageManager.local.get(KEY, {});
      cache = { ...DEFAULTS, ...(stored || {}) };
      window.I18n.set(cache.language);
      return cache;
    },
    async set(patch) {
      cache = { ...cache, ...patch };
      await window.StorageManager.local.set(KEY, cache);
      if (patch.language) window.I18n.set(patch.language);
      listeners.forEach((fn) => {
        try { fn(cache); } catch (e) { console.warn(e); }
      });
      return cache;
    },
    onChange(fn) { listeners.push(fn); },
    export() { return JSON.stringify(cache, null, 2); },
    async import(json) {
      try {
        const obj = JSON.parse(json);
        if (!obj || typeof obj !== 'object') throw new Error('formato inválido');
        const clean = {};
        Object.keys(DEFAULTS).forEach((k) => { if (k in obj) clean[k] = obj[k]; });
        await SettingsManager.set(clean);
        return true;
      } catch (e) {
        throw new Error(`Importação falhou: ${e.message}`);
      }
    },
    async reset() { return SettingsManager.set({ ...DEFAULTS }); },
  };

  window.SettingsManager = SettingsManager;
})();
