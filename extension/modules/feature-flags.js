/* feature-flags.js — controle central de recursos instáveis da SUPER LOVABLE.
 * Uma falha de plataforma desativa somente o recurso afetado, nunca a extensão.
 * Funciona no popup e no service worker (usa chrome.storage.local diretamente).
 */
(function (root) {
  const KEY = 'super_lovable_feature_flags';

  const DEFAULTS = {
    nativeDownload: true,
    nativeProjectCreation: true,
    nativeCloud: true,
    nativeDeployment: false,
    nativeSecrets: false,
    nativeProjectFiles: true,
    nativeWatermark: false,
  };

  let cache = { ...DEFAULTS };
  let loaded = false;
  const diagnostics = [];

  function read(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (r) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(r && r[key] !== undefined ? r[key] : null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function write(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => resolve(!chrome.runtime.lastError));
      } catch (e) {
        resolve(false);
      }
    });
  }

  const FeatureFlags = {
    DEFAULTS,
    get all() { return { ...cache }; },
    get diagnostics() { return diagnostics.slice(-50); },

    async load() {
      const stored = await read(KEY);
      cache = { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
      loaded = true;
      return { ...cache };
    },

    /** Leitura síncrona: usa o cache já carregado (ou os padrões). */
    get(name) {
      if (!loaded) void FeatureFlags.load();
      return cache[name] !== undefined ? !!cache[name] : false;
    },

    async isEnabled(name) {
      if (!loaded) await FeatureFlags.load();
      return !!cache[name];
    },

    async set(patch) {
      if (!loaded) await FeatureFlags.load();
      cache = { ...cache, ...patch };
      await write(KEY, cache);
      return { ...cache };
    },

    /** Desativa apenas o recurso quebrado e registra o diagnóstico local. */
    async disable(name, reason = 'indisponível') {
      if (cache[name] === false) return false;
      diagnostics.push({ ts: Date.now(), flag: name, reason: String(reason).slice(0, 160) });
      if (diagnostics.length > 50) diagnostics.splice(0, diagnostics.length - 50);
      await FeatureFlags.set({ [name]: false });
      return true;
    },

    async reset() {
      cache = { ...DEFAULTS };
      await write(KEY, cache);
      return { ...cache };
    },
  };

  void FeatureFlags.load();
  root.FeatureFlags = FeatureFlags;
})(typeof self !== 'undefined' ? self : globalThis);
