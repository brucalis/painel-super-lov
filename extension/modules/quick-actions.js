// quick-actions.js — atalhos rápidos editáveis
(function () {
  const KEY = 'lca_shortcuts';
  const DEFAULTS = [
    { id: 'bugs', label: 'Bugs', text: 'Analise o projeto em busca de bugs, comportamentos inesperados, erros de lógica, falhas de integração e problemas que possam afetar a experiência do usuário. Corrija apenas o que for necessário e preserve as funcionalidades existentes.' },
    { id: 'refatorar', label: 'Refatorar', text: 'Refatore o código para melhorar organização, legibilidade, reutilização e manutenção, sem alterar o comportamento visual ou funcional da aplicação.' },
    { id: 'erros', label: 'Erros', text: 'Revise o tratamento de erros da aplicação. Adicione validações, mensagens claras, estados de falha, try/catch quando necessário e alternativas de recuperação para o usuário.' },
    { id: 'otimizar', label: 'Otimizar', text: 'Analise o desempenho da aplicação e otimize carregamento, renderizações, consultas, processamento e uso de recursos, sem remover funcionalidades.' },
    { id: 'comentarios', label: 'Comentários', text: 'Adicione comentários úteis nas partes mais importantes do código, explicando decisões, responsabilidades e fluxos complexos, sem inserir comentários óbvios ou excessivos.' },
    { id: 'seo', label: 'SEO', text: 'Revise e melhore o SEO técnico da página, incluindo títulos, descrições, estrutura semântica, headings, metadados, Open Graph, performance e indexação.' },
    { id: 'ui', label: 'UI', text: 'Revise a interface e melhore consistência visual, espaçamento, hierarquia, estados interativos, responsividade e acessibilidade, preservando a identidade visual atual.' },
    { id: 'componentes', label: 'Componentes', text: 'Analise os componentes existentes e reorganize-os quando necessário para melhorar reutilização, separação de responsabilidades e manutenção, sem alterar o funcionamento atual.' },
    { id: 'review', label: 'Review', text: 'Faça uma revisão completa das últimas alterações, identifique problemas, regressões, inconsistências e pontos incompletos. Corrija apenas falhas confirmadas.' },
  ];

  let items = [...DEFAULTS];

  const QuickActions = {
    get items() { return items; },
    defaults: DEFAULTS,
    async load() {
      const stored = await window.StorageManager.local.get(KEY, null);
      items = Array.isArray(stored) && stored.length ? stored : [...DEFAULTS];
      return items;
    },
    async save() { await window.StorageManager.local.set(KEY, items); },
    async add(label, text) {
      items.push({ id: `c_${Date.now()}`, label, text });
      await QuickActions.save();
    },
    async update(id, patch) {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      Object.assign(it, patch);
      await QuickActions.save();
    },
    async remove(id) {
      items = items.filter((i) => i.id !== id);
      await QuickActions.save();
    },
    async duplicate(id) {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      items.push({ ...it, id: `c_${Date.now()}`, label: `${it.label} (cópia)` });
      await QuickActions.save();
    },
    async move(id, dir) {
      const i = items.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      await QuickActions.save();
    },
    async restore() {
      items = [...DEFAULTS];
      await QuickActions.save();
    },
  };

  window.QuickActions = QuickActions;
})();
