const SECTION_RE = /\b(objetivo|contexto|requisitos|restrições|criterios de aceite|critérios de aceite)\b/i;

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function improvePromptLocally(input, options = {}) {
  const original = cleanText(input);
  if (!original) return { original: '', improved: '', changed: false };
  if (SECTION_RE.test(original)) return { original, improved: original, changed: false };

  const mode = options.mode || 'general';
  const modeRules = {
    bugs: '- Corrigir a causa do erro sem remover funcionalidades existentes.',
    refactor: '- Refatorar apenas o necessário, preservando o comportamento atual.',
    ui: '- Manter responsividade, hierarquia visual e consistência com a identidade existente.',
    seo: '- Preservar conteúdo relevante e aplicar melhorias técnicas verificáveis.',
    general: '- Preservar funcionalidades existentes e não alterar áreas não solicitadas.'
  };

  const improved = [
    'OBJETIVO',
    original,
    '',
    'CONTEXTO DE EXECUÇÃO',
    '- Aplicar a alteração no repositório e na branch atualmente selecionados.',
    '- Não enviar esta solicitação ao chat da Lovable.',
    '',
    'RESTRIÇÕES',
    modeRules[mode] || modeRules.general,
    '- Não apagar arquivos, dependências ou integrações sem necessidade comprovada.',
    '- Evitar regressões e manter compatibilidade com o projeto atual.',
    '',
    'CRITÉRIOS DE ACEITE',
    '- O projeto deve continuar compilando.',
    '- A alteração solicitada deve ser verificável no código e no preview.',
    '- Informar claramente quais arquivos foram alterados.'
  ].join('\n');

  return { original, improved, changed: improved !== original };
}
