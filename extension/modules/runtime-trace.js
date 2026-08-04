/* runtime-trace.js — diagnóstico local das ações (sem dados sensíveis).
 * Guarda no máximo 200 registros e nunca grava token, cookie, licença,
 * conteúdo de prompt, anexo ou dado pessoal.
 */
(function (root) {
  const KEY = 'super_lovable_runtime_trace';
  const MAX = 200;

  let entries = [];
  let loaded = false;

  function read() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(KEY, (r) => resolve((r && r[KEY]) || []));
      } catch (e) {
        resolve([]);
      }
    });
  }

  function write(list) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [KEY]: list }, () => resolve(true));
      } catch (e) {
        resolve(false);
      }
    });
  }

  function maskProject(id) {
    if (!id) return null;
    const s = String(id);
    return s.length <= 8 ? `••••${s.slice(-4)}` : `${s.slice(0, 4)}••••${s.slice(-4)}`;
  }

  const RuntimeTraceManager = {
    MAX,
    async load() {
      entries = await read();
      loaded = true;
      return entries;
    },

    async record({ actionName, actionType, status, durationMs, projectId, errorCode }) {
      if (!loaded) await RuntimeTraceManager.load();
      entries.push({
        timestamp: Date.now(),
        actionName: String(actionName || 'UNKNOWN').slice(0, 60),
        actionType: actionType || 'local',
        status: String(status || 'idle').slice(0, 24),
        durationMs: typeof durationMs === 'number' ? Math.round(durationMs) : undefined,
        projectIdMasked: maskProject(projectId),
        errorCode: errorCode ? String(errorCode).slice(0, 40) : undefined,
      });
      if (entries.length > MAX) entries.splice(0, entries.length - MAX);
      await write(entries);
    },

    async list() {
      if (!loaded) await RuntimeTraceManager.load();
      return entries.slice().reverse();
    },

    async clear() {
      entries = [];
      loaded = true;
      await write(entries);
    },

    format(e) {
      const time = new Date(e.timestamp).toLocaleTimeString();
      const dur = e.durationMs !== undefined ? ` (${e.durationMs}ms)` : '';
      const err = e.errorCode ? ` · ${e.errorCode}` : '';
      return `${time} [${String(e.actionType).toUpperCase()}] ${e.actionName} → ${String(e.status).toUpperCase()}${dur}${err}`;
    },
  };

  root.RuntimeTraceManager = RuntimeTraceManager;
})(typeof self !== 'undefined' ? self : globalThis);
