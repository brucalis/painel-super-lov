# Super Lovable V2 — Editor visual

## Objetivo
Permitir que o usuário aponte visualmente para um elemento do projeto aberto na Lovable e use essa seleção como contexto de uma alteração executada pelo fluxo GitHub.

## Fluxo
1. Usuário abre o projeto na Lovable.
2. Na extensão, clica em **Selecionar elemento**.
3. O content script entra em modo de inspeção e destaca o elemento sob o cursor.
4. Um clique captura seletor, tag, classes, texto, aria-label, URL, projeto e posição visual.
5. A seleção é armazenada temporariamente no service worker.
6. O popup mostra o elemento selecionado.
7. Ao criar a tarefa, `TaskOrchestrator` anexa `visualSelection` ao contrato enviado ao agente.
8. O agente deve localizar no repositório o componente que corresponde ao elemento e aplicar a menor alteração possível.

## Limite importante
A seleção DOM não prova sozinha qual arquivo-fonte renderiza o elemento. O agente de edição precisa correlacionar texto, atributos, classes e estrutura do repositório. Frameworks podem gerar classes dinâmicas ou componentes compartilhados.

## Segurança
O seletor apenas lê metadados visuais da página. Ele não executa código do site, não captura campos de senha e não envia a seleção ao chat da Lovable.

## Próxima evolução
- screenshot recortado do elemento;
- mapeamento source-map quando disponível;
- seleção de seção/contêiner pai;
- múltiplos elementos em uma mesma tarefa;
- preview/diff antes do commit.
