# Super Lovable v2 — Fundação técnica

## Objetivo

Reconstruir o núcleo da extensão para executar alterações por meios autorizados, principalmente GitHub, preservando os recursos locais já existentes e reduzindo a dependência da interface interna da Lovable.

A versão atual da extensão permanece intacta. A v2 será desenvolvida e validada na branch `super-lovable-v2-foundation` antes de qualquer integração com a `main`.

## Princípios obrigatórios

1. Não depender de seletores frágeis, botões internos ou ações ocultas da interface da Lovable.
2. Não prometer recursos que dependam de comportamento não documentado da plataforma.
3. Usar GitHub, Supabase e demais integrações somente mediante autorização explícita do usuário.
4. Preservar o projeto original por meio de commits, branches, histórico, validação e possibilidade de reversão.
5. Nunca gravar tokens, chaves ou segredos diretamente no código-fonte ou no armazenamento sem proteção adequada.
6. Manter a extensão simples para usuários leigos, com instruções claras para qualquer etapa externa.
7. Informar, dentro da interface, quais ações são locais, quais dependem do GitHub e quais exigem confirmação na Lovable.

## Recursos que devem ser preservados

- Licença e controle de acesso.
- Reconhecimento do dispositivo, corrigindo reinstalações na mesma máquina.
- Áudio e transcrição.
- Anexos.
- Melhoria de prompt.
- Fila automática.
- Histórico.
- Atalhos rápidos.
- Notificações.
- Configurações.
- Download do projeto.
- Criação assistida de projeto.
- Orientações para Lovable Cloud, Supabase, domínio, deploy e integrações.

## Recursos novos da v2

- Autenticação GitHub por OAuth ou GitHub App.
- Seleção e associação de repositório por projeto.
- Leitura controlada da estrutura do projeto.
- Geração de plano de alteração antes de editar.
- Execução de tarefas em arquivos do repositório.
- Validação sintática e estrutural antes do commit.
- Commit automático com mensagem clara.
- Opção de Pull Request para alterações de maior risco.
- Acompanhamento de sincronização entre GitHub e Lovable.
- Registro dos arquivos modificados.
- Reversão do último conjunto de alterações.
- Backup antes de alterações críticas.
- Guias contextuais para ações que precisam ser concluídas fora da extensão.

## Arquitetura-alvo

```text
Interface da extensão
        ↓
Gerenciador de tarefas
        ↓
Orquestrador de projeto
        ↓
Análise de contexto e plano
        ↓
Provedor autorizado de edição
        ↓
GitHub
        ↓
Commit ou Pull Request
        ↓
Sincronização do projeto conectado à Lovable
```

## Estados padronizados das tarefas

- `draft`: rascunho ainda não enviado.
- `queued`: aguardando execução.
- `authorizing`: aguardando autorização externa.
- `reading_repository`: lendo o contexto do projeto.
- `planning`: criando plano de alteração.
- `awaiting_confirmation`: aguardando confirmação do usuário.
- `editing`: aplicando mudanças.
- `validating`: verificando alterações.
- `committing`: criando commit.
- `syncing`: aguardando sincronização.
- `completed`: concluído.
- `failed`: falhou.
- `cancelled`: cancelado.
- `rolled_back`: revertido.

## Estrutura visual

Referência: interface clean com navegação lateral esquerda.

### Menu lateral

- Criar
- Fila
- Histórico
- Projetos
- Ferramentas
- Integrações
- Ajuda
- Configurações

### Área principal

A área principal exibe somente o conteúdo relacionado ao item selecionado. Informações secundárias devem aparecer em:

- tooltips;
- modais curtos;
- accordions;
- painéis deslizantes;
- mensagens contextuais.

### Identidade visual

- Fundo azul-marinho muito escuro.
- Superfícies discretas, sem excesso de cartões.
- Gradiente azul → violeta → rosa.
- Indicadores verdes apenas para sucesso e conexão.
- Tipografia clara e espaçamento generoso.
- Ícones simples, consistentes e acompanhados por texto.
- Nenhuma seleção fictícia de modelos de IA.

## Etapas de execução

### Etapa 1 — Fundação isolada

- Criar branch própria.
- Documentar arquitetura e recursos.
- Criar contratos e estados comuns.
- Criar shell visual do menu lateral.
- Não conectar o novo motor à extensão atual.

### Etapa 2 — Identidade, licença e sessão

- Corrigir reconhecimento da mesma máquina após reinstalação.
- Carregar estado local antes de mostrar a tela de ativação.
- Exibir tela de carregamento neutra durante validação.
- Implementar cache seguro e revalidação em segundo plano.

### Etapa 3 — GitHub

- OAuth ou GitHub App.
- Seleção de repositório.
- Associação projeto ↔ repositório.
- Permissões mínimas.
- Revogação e troca de conta.

### Etapa 4 — Motor de tarefas

- Contexto do repositório.
- Plano de alteração.
- Confirmação.
- Edição.
- Validação.
- Commit ou Pull Request.
- Histórico e reversão.

### Etapa 5 — Recursos locais reaproveitados

- Áudio.
- Transcrição.
- Anexos.
- Melhorar prompt.
- Fila.
- Histórico.
- Atalhos.

### Etapa 6 — Integrações e guias

- Supabase.
- Lovable Cloud.
- Webhooks.
- Variáveis de ambiente.
- Pagamentos.
- Domínio e deploy.
- Instruções claras sobre ações externas.

### Etapa 7 — Ferramentas

- Download do repositório em ZIP.
- Criar branch de segurança.
- Reverter alteração.
- Exportar relatório técnico.
- Localizar e remover componentes de marca presentes no código do próprio projeto.

### Etapa 8 — Testes e migração

- Testes unitários e de integração.
- Teste em conta gratuita e paga da Lovable.
- Testes mobile e acessibilidade da interface.
- Migração gradual.
- Plano de rollback.

## Critérios para concluir a Etapa 1

- A branch isolada existe.
- A documentação técnica está registrada.
- Os contratos de tarefa e integração existem sem efeitos colaterais.
- O shell visual da navegação lateral está disponível como protótipo isolado.
- Nenhum comportamento da versão atual foi alterado.
