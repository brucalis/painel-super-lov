/* prompt-modes.js — modos de otimização do prompt da SUPER LOVABLE.
 *
 * IMPORTANTE: estes modos NÃO são conexões com OpenAI, Google ou Anthropic.
 * Nenhuma chave de API existe aqui. Cada modo apenas prepara o texto do
 * pedido antes de ele seguir pelo mecanismo de envio já existente.
 *
 * Funciona tanto no popup (window) quanto no service worker (self).
 */
(function (root) {
  const STORAGE_KEY = 'super_lovable_active_mode';
  const DEFAULT_MODE = 'automatic';
  const SEPARATOR = 'SOLICITAÇÃO ORIGINAL DO USUÁRIO:';
  const MARKER_RE = /^\s*\[SUPER_LOVABLE_MODE:[A-Z]+\]/;

  const MODES = [
    {
      id: 'automatic',
      name: 'Automático',
      short: 'Automático',
      tag: 'Automático',
      description: 'Escolhe a melhor abordagem.',
      tooltip: 'Adapta a abordagem ao tipo de pedido.',
      icon: '⚡',
      marker: 'AUTO',
      instruction:
        'Analise o pedido e escolha a abordagem mais adequada para executá-lo. Preserve as funcionalidades existentes, evite alterações desnecessárias e entregue uma solução completa, funcional e coerente com o projeto atual.',
      attachmentsNote:
        'Considere os arquivos anexados como parte do pedido e utilize-os conforme forem relevantes.',
    },
    {
      id: 'codex',
      name: 'GPT-5 Codex',
      short: 'Código',
      tag: 'Código',
      description: 'Lógica, arquitetura e código.',
      tooltip: 'Prioriza lógica, arquitetura e integridade do código.',
      icon: '⌘',
      marker: 'CODEX',
      instruction: [
        'MODO CÓDIGO E ARQUITETURA ATIVADO.',
        'Antes de executar o pedido, analise a arquitetura atual, os componentes relacionados, dependências, tipagens, estados, rotas, funções e possíveis efeitos colaterais.',
        'Priorize lógica correta, código funcional, estabilidade, segurança, reutilização e compatibilidade com o restante do projeto.',
        'Corrija a causa do problema, não apenas o efeito visual.',
        'Evite duplicação de código, soluções temporárias e alterações em arquivos desnecessários.',
        'Preserve integralmente as funcionalidades já existentes que não fazem parte do pedido.',
        'Verifique erros de build, tipagem, imports, referências, estados e comportamento responsivo antes de concluir.',
        'Execute o pedido original a seguir sem alterar seu objetivo:',
      ].join('\n'),
      attachmentsNote:
        'Considere os arquivos anexados como material técnico (códigos, logs, estruturas, prints de erro) ao analisar o problema.',
    },
    {
      id: 'gemini',
      name: 'Gemini 3.1 Pro',
      short: 'Contexto',
      tag: 'Contexto',
      description: 'Contexto amplo e raciocínio.',
      tooltip: 'Analisa o contexto amplo antes de alterar o projeto.',
      icon: '✦',
      marker: 'GEMINI',
      instruction: [
        'MODO CONTEXTO COMPLETO ATIVADO.',
        'Antes de realizar qualquer alteração, analise o contexto disponível do projeto como um todo.',
        'Considere páginas, componentes, rotas, estados, banco de dados, autenticação, integrações, responsividade, identidade visual e funcionalidades relacionadas.',
        'Identifique dependências entre a alteração solicitada e outras partes da aplicação.',
        'Não trate o pedido como uma mudança isolada quando ele afetar outras áreas do projeto.',
        'Preserve padrões já existentes e evite criar inconsistências entre telas ou componentes.',
        'Tome decisões com base no contexto real encontrado no projeto e não invente arquivos, endpoints, tabelas ou integrações inexistentes.',
        'Execute o pedido original a seguir de maneira completa e contextualizada:',
      ].join('\n'),
      attachmentsNote:
        'Considere os arquivos anexados como parte do contexto do projeto ao interpretar o pedido.',
    },
    {
      id: 'claude',
      name: 'Claude Opus 4.7',
      short: 'Criatividade',
      tag: 'Criatividade',
      description: 'Clareza, criatividade e interface.',
      tooltip: 'Prioriza clareza, interface, criatividade e escrita natural.',
      icon: '💡',
      marker: 'CLAUDE',
      instruction: [
        'MODO CLAREZA, CRIATIVIDADE E EXPERIÊNCIA ATIVADO.',
        'Execute o pedido priorizando clareza, organização, boa experiência do usuário, hierarquia visual, consistência, escrita natural e acabamento profissional.',
        'Em alterações visuais, preserve a identidade atual do projeto e melhore layout, espaçamento, legibilidade, responsividade, acessibilidade e fluidez da interface.',
        'Em textos, utilize linguagem clara, natural, objetiva e coerente com o contexto da aplicação.',
        'Evite interfaces genéricas, excesso de elementos, blocos desnecessários e soluções visualmente confusas.',
        'Não sacrifique funcionalidade em favor da aparência.',
        'Preserve tudo o que já funciona e altere somente o necessário para atender ao pedido original.',
        'Execute o pedido original a seguir:',
      ].join('\n'),
      attachmentsNote:
        'Considere os arquivos anexados como referências visuais e de linguagem para o resultado final.',
    },
  ];

  const byId = (id) => MODES.find((m) => m.id === id) || MODES[0];

  /** Já existe instrução de modo aplicada neste texto? */
  function hasMode(text) {
    return MARKER_RE.test(String(text || ''));
  }

  /** Remove o marcador interno — usado só na exibição, nunca no envio. */
  function stripMarker(text) {
    return String(text || '').replace(MARKER_RE, '').replace(/^\s*\n/, '');
  }

  /**
   * Função central de preparação do prompt.
   * Combina apenas em memória: o texto original nunca é alterado.
   */
  function buildPrompt({ text, modeId = DEFAULT_MODE, attachments = [] } = {}) {
    const original = String(text || '');
    if (hasMode(original)) return original; // proteção contra instrução duplicada
    const mode = byId(modeId);
    if (!mode || mode.id === DEFAULT_MODE) {
      // Automático: instrução curta, sem especialização rígida.
      const head = `[SUPER_LOVABLE_MODE:${mode.marker}]\n${mode.instruction}`;
      const notes = attachments && attachments.length ? `\n${mode.attachmentsNote}` : '';
      return `${head}${notes}\n\n${SEPARATOR}\n${original}`;
    }
    const notes = attachments && attachments.length ? `\n${mode.attachmentsNote}` : '';
    return `[SUPER_LOVABLE_MODE:${mode.marker}]\n${mode.instruction}${notes}\n\n${SEPARATOR}\n${original}`;
  }

  async function getActive() {
    try {
      const r = await chrome.storage.local.get(STORAGE_KEY);
      const id = r && r[STORAGE_KEY];
      return byId(id).id;
    } catch (e) {
      return DEFAULT_MODE;
    }
  }

  async function setActive(id) {
    const mode = byId(id);
    try { await chrome.storage.local.set({ [STORAGE_KEY]: mode.id }); } catch (e) { /* opcional */ }
    return mode.id;
  }

  root.PromptModes = {
    STORAGE_KEY,
    DEFAULT_MODE,
    SEPARATOR,
    MODES,
    get(id) { return byId(id); },
    label(id) { return byId(id).tag; },
    hasMode,
    stripMarker,
    buildPrompt,
    getActive,
    setActive,
  };
})(typeof self !== 'undefined' ? self : window);
