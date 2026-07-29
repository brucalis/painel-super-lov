// prompt-enhancer.js — melhoria de prompt (provider abstrato + fallback local determinístico)
(function () {
  const MODES = {
    clareza: 'Clareza',
    detalhes: 'Mais detalhes',
    curto: 'Mais curto',
    tecnico: 'Técnico',
    design: 'Design/UI',
    bugs: 'Correção de bugs',
    seo: 'SEO',
    responsivo: 'Responsividade',
    acessibilidade: 'Acessibilidade',
    seguranca: 'Segurança',
  };

  const CHECKLIST = {
    clareza: ['Explique o objetivo em uma frase inicial.', 'Liste os requisitos em tópicos objetivos.', 'Indique claramente o resultado esperado.'],
    detalhes: ['Descreva o comportamento esperado passo a passo.', 'Inclua estados de carregamento, vazio e erro.', 'Cite dependências e arquivos envolvidos.'],
    curto: ['Vá direto ao ponto, sem repetições.'],
    tecnico: ['Descreva a implementação por camadas.', 'Especifique contratos de dados e tipos.', 'Informe validações e tratamento de erros.'],
    design: ['Preserve a identidade visual atual.', 'Cuide de espaçamento, hierarquia e estados interativos.'],
    bugs: ['Reproduza o problema em passos.', 'Corrija apenas a causa confirmada.', 'Não altere funcionalidades que já funcionam.'],
    seo: ['Revise title, meta description, headings e Open Graph.', 'Garanta HTML semântico e imagens com alt.'],
    responsivo: ['Valide os breakpoints mobile, tablet e desktop.', 'Evite overflow horizontal.'],
    acessibilidade: ['Use aria-labels, foco visível e contraste adequado.', 'Garanta navegação por teclado.'],
    seguranca: ['Valide entradas e trate erros.', 'Não exponha chaves ou dados sensíveis.'],
  };

  // Trechos que NUNCA podem ser alterados pela melhoria local.
  function protect(text) {
    const tokens = [];
    const keep = (re) => {
      text = text.replace(re, (m) => {
        tokens.push(m);
        return `«${tokens.length - 1}»`;
      });
    };
    keep(/```[\s\S]*?```/g);
    keep(/`[^`]+`/g);
    keep(/https?:\/\/\S+/g);
    keep(/"[^"]*"/g);
    keep(/#[0-9a-fA-F]{3,8}\b/g);
    keep(/\b\d+(?:\.\d+)?\s?(px|rem|em|%|MB|KB|s|ms)\b/g);
    return { text, tokens };
  }

  function restore(text, tokens) {
    return text.replace(/«(\d+)»/g, (_, i) => tokens[Number(i)] ?? '');
  }

  function localImprove({ text, mode, projectContext }) {
    const { text: safe, tokens } = protect(text.trim());
    const lines = safe
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const body = mode === 'curto' ? lines.slice(0, 6) : lines;
    const parts = [];
    parts.push(`Objetivo: ${body[0] || safe}`);
    if (body.length > 1) {
      parts.push('\nRequisitos:');
      body.slice(1).forEach((l) => parts.push(`- ${l.replace(/^[-*•]\s*/, '')}`));
    }
    parts.push(`\nFoco desta revisão (${MODES[mode] || mode}):`);
    (CHECKLIST[mode] || CHECKLIST.clareza).forEach((c) => parts.push(`- ${c}`));
    parts.push('\nRestrições:');
    parts.push('- Preserve o comportamento e as funcionalidades já existentes.');
    parts.push('- Não invente requisitos que não estejam descritos acima.');
    if (projectContext?.projectId) parts.push(`- Projeto alvo: ${projectContext.projectId}`);
    return restore(parts.join('\n'), tokens);
  }

  const PromptEnhancer = {
    MODES,
    /** provider abstrato: usa endpoint configurado, senão melhora localmente. */
    async improve({ text, mode = 'clareza', projectContext = {} }) {
      if (!text || !text.trim()) throw new Error('Escreva um prompt antes de melhorar.');
      const endpoint = window.SettingsManager.get('enhancerEndpoint');
      if (endpoint) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, mode, projectContext }),
          });
          if (!res.ok) throw new Error(`status ${res.status}`);
          const data = await res.json();
          const improved = data.text || data.improved || data.result;
          if (improved) return { text: improved, source: 'endpoint' };
          throw new Error('resposta vazia');
        } catch (e) {
          console.warn('enhancer endpoint falhou, usando melhoria local:', e);
        }
      }
      return { text: localImprove({ text, mode, projectContext }), source: 'local' };
    },
  };

  window.PromptEnhancer = PromptEnhancer;
})();
