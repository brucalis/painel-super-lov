/* usage-state.js — estado informativo do processamento da Lovable.
 * NUNCA altera saldo, quota, cobrança ou classificação de mensagem.
 * Apenas registra o que a plataforma informou para explicar ao usuário.
 */
(function (root) {
  const KEY = 'super_lovable_usage_state';

  let state = { status: 'unknown', lastUpdatedAt: 0, source: undefined };

  const LIMIT_PATTERNS = [
    /credits?_exhausted/i,
    /quota_exceeded/i,
    /usage_limit/i,
    /limite (?:de|da) (?:uso|conta|créditos)/i,
    /out of credits/i,
  ];

  function persist() {
    try { chrome.storage.local.set({ [KEY]: state }); } catch (e) { /* noop */ }
  }

  const LovableUsageState = {
    get state() { return { ...state }; },

    async load() {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(KEY, (r) => {
            if (r && r[KEY]) state = r[KEY];
            resolve({ ...state });
          });
        } catch (e) { resolve({ ...state }); }
      });
    },

    set(status, source) {
      state = { status, lastUpdatedAt: Date.now(), source: source ? String(source).slice(0, 60) : undefined };
      persist();
      return { ...state };
    },

    /** Lê a resposta real da plataforma e classifica sem mascarar o erro. */
    fromResponse({ httpStatus, body = '', source = 'lovable' } = {}) {
      const text = typeof body === 'string' ? body : JSON.stringify(body || '');
      if (httpStatus === 402 || LIMIT_PATTERNS.some((p) => p.test(text))) {
        return LovableUsageState.set('exhausted', source);
      }
      if (httpStatus === 429) return LovableUsageState.set('rate-limited', source);
      if (httpStatus === 401 || httpStatus === 403) return LovableUsageState.set('blocked', source);
      if (httpStatus && httpStatus < 400) return LovableUsageState.set('available', source);
      return { ...state };
    },

    message() {
      switch (state.status) {
        case 'exhausted':
          return 'Esta ação depende do processamento da Lovable e não pôde ser concluída porque o limite da conta foi atingido.';
        case 'rate-limited':
          return 'A Lovable pediu para aguardar antes de novas solicitações. Tente novamente em alguns instantes.';
        case 'blocked':
          return 'Não foi possível validar sua sessão da Lovable. Recarregue o projeto e tente novamente.';
        default:
          return '';
      }
    },
  };

  void LovableUsageState.load();
  root.LovableUsageState = LovableUsageState;
})(typeof self !== 'undefined' ? self : globalThis);
