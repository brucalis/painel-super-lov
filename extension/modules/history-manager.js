// history-manager.js — histórico local dos envios (sem tokens/cookies)
(function () {
  const KEY = 'lca_history';
  let items = [];

  const HistoryManager = {
    get items() { return items; },
    async load() {
      items = (await window.StorageManager.local.get(KEY, [])) || [];
      return items;
    },
    async save() {
      const limit = window.SettingsManager.get('historyLimit') || 500;
      if (items.length > limit) {
        const favs = items.filter((i) => i.favorite);
        const rest = items.filter((i) => !i.favorite).slice(0, Math.max(0, limit - favs.length));
        items = [...favs, ...rest].sort((a, b) => b.date - a.date);
      }
      await window.StorageManager.local.set(KEY, items);
    },
    async add(entry) {
      items.unshift({
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: Date.now(),
        text: '',
        attachments: [],
        project: null,
        status: 'concluído',
        model: 'auto',
        origin: 'prompt',
        summary: '',
        error: null,
        durationMs: 0,
        favorite: false,
        ...entry,
      });
      await HistoryManager.save();
    },
    async update(id, patch) {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      Object.assign(it, patch);
      await HistoryManager.save();
    },
    async remove(id) {
      items = items.filter((i) => i.id !== id);
      await HistoryManager.save();
    },
    async toggleFavorite(id) {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      it.favorite = !it.favorite;
      await HistoryManager.save();
    },
    async clear() {
      items = [];
      await HistoryManager.save();
    },
    search({ query = '', project = '', from = null } = {}) {
      const q = query.toLowerCase();
      return items.filter((i) => {
        if (q && !`${i.text} ${i.summary}`.toLowerCase().includes(q)) return false;
        if (project && i.project !== project) return false;
        if (from && i.date < from) return false;
        return true;
      });
    },
  };

  window.HistoryManager = HistoryManager;
})();
