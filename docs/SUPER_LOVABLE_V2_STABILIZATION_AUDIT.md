# Super Lovable V2 — Auditoria de estabilização

## Objetivo
Verificar se a branch V2 está tecnicamente separada do mecanismo legado e se os módulos visíveis possuem pontos de montagem e ações correspondentes.

## Problemas críticos encontrados e corrigidos

### 1. Motor legado ainda ativo
O `manifest.json` carregava `content.js`, que interceptava o chat da Lovable e usava a fila antiga. O service worker também inicializava `lovable-sender.js` e `queue-engine.js`.

**Correção:** a V2 agora usa `v2/background-v2.js` e carrega apenas `v2/runtime/visual-editor-content.js` nas páginas da Lovable.

### 2. Ferramentas sem botões
O HTML possuía apenas o contêiner `#toolsGrid`, enquanto `tools-runtime.js` procurava botões inexistentes.

**Correção:** o runtime agora monta os sete cards antes de registrar os eventos.

### 3. Supabase podia falhar na abertura
O runtime tentava executar `classList` em `#supabaseCard`, embora o card não tivesse esse ID.

**Correção:** identificação e acessos agora são defensivos e aceitam o HTML atual.

### 4. Preview/Diff dependia do HTML
O módulo de preview podia não ser carregado após reorganizações do popup.

**Correção:** o editor visual importa o preview e o preview injeta seu próprio CSS.

## Situação atual
- A V2 está separada do envio legado para a Lovable.
- O código antigo continua no repositório, mas não é carregado pelo manifest da branch V2.
- Ferramentas, Supabase, editor visual e preview possuem inicialização defensiva.
- Simuladores continuam ativos para licenças, GitHub, agente, execução e integrações.

## Limites desta auditoria
Esta auditoria foi estática. Ainda é necessário carregar a pasta `extension` no Chrome e realizar testes reais de console, navegação e permissões.

## Testes manuais obrigatórios
1. Recarregar a extensão em `chrome://extensions`.
2. Abrir o popup e confirmar ausência de erros no console.
3. Navegar por todas as abas.
4. Confirmar que nenhum campo do chat da Lovable é interceptado.
5. Testar seleção visual após recarregar a página da Lovable.
6. Testar licença simulada ativa, expirada e revogada.
7. Testar ferramentas com projeto simulado selecionado.
8. Testar abertura dos modais de planejamento e preview.
