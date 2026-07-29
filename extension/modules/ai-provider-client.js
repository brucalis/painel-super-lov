// ai-provider-client.js — camada de seleção de modelos da SUPER LOVABLE.
// A extensão NUNCA guarda chaves de OpenAI, Google ou Anthropic. Qualquer
// chamada real acontece num backend próprio configurado pelo usuário.
(function () {
  const KEY = 'super_lovable_ai_config';

  const AI_PROVIDERS = [
    {
      id: 'auto',
      name: 'Automático',
      description: 'Usa o modelo padrão configurado na Lovable',
      icon: '⚡',
      enabled: true,
      configured: true,
      modelId: null,
    },
    {
      id: 'gpt',
      name: 'GPT/Codex',
      description: 'Lógica e código',
      icon: '◆',
      enabled: false,
      configured: false,
      modelId: null,
    },
    {
      id: 'gemini',
      name: 'Gemini',
      description: 'Contexto longo e raciocínio',
      icon: '✦',
      enabled: false,
      configured: false,
      modelId: null,
    },
    {
      id: 'claude',
      name: 'Claude',
      description: 'Escrita e análise',
      icon: '❖',
      enabled: false,
      configured: false,
      modelId: null,
    },
  ];

  let config = { endpoint: '', providers: {} };

  const AiProviderClient = {
    get providers() {
      return AI_PROVIDERS.map((p) => {
        const cfg = config.providers[p.id] || {};
        const configured = p.id === 'auto' ? true : !!(config.endpoint && cfg.enabled);
        return {
          ...p,
          configured,
          enabled: p.id === 'auto' ? true : configured,
          modelId: cfg.modelId || p.modelId,
          state: p.id === 'auto' ? 'disponivel' : configured ? 'disponivel' : 'nao-configurado',
        };
      });
    },
    get endpoint() { return config.endpoint; },
    async load() {
      config = (await window.StorageManager.local.get(KEY, null)) || { endpoint: '', providers: {} };
      config.providers = config.providers || {};
      return config;
    },
    async setEndpoint(endpoint) {
      config.endpoint = String(endpoint || '').trim();
      await window.StorageManager.local.set(KEY, config);
    },
    /**
     * Chama o backend do usuário. Nunca envia cookies/token da Lovable.
     * Retorna { ok, text } ou lança erro descritivo.
     */
    async complete({ providerId, prompt, mode }) {
      const provider = AiProviderClient.providers.find((p) => p.id === providerId);
      if (!provider || !provider.configured || provider.id === 'auto') {
        throw new Error('Este provedor ainda não possui uma API configurada.');
      }
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, model: provider.modelId, prompt, mode }),
      });
      if (res.status === 401 || res.status === 403) throw new Error('Erro de autenticação no provedor configurado.');
      if (!res.ok) throw new Error(`Provedor indisponível (HTTP ${res.status}).`);
      const data = await res.json().catch(() => ({}));
      const text = data.text || data.result || data.output;
      if (!text) throw new Error('O provedor respondeu sem conteúdo utilizável.');
      return { ok: true, text };
    },
  };

  window.AI_PROVIDERS = AI_PROVIDERS;
  window.AiProviderClient = AiProviderClient;
})();
