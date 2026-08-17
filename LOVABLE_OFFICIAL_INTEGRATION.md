# Integração oficial da Super Lovable

## Métodos testados

### 1. Build with URL

- Documentado publicamente pela Lovable.
- Funciona para criar um projeto novo a partir de um prompt.
- Não edita silenciosamente um projeto já aberto.
- Implementado em `POST /api/public/lovable-dispatch` com `method=build_with_url`.

### 2. Lovable MCP

- Endpoint oficial: `https://mcp.lovable.dev`.
- As ferramentas oficiais podem criar projetos, enviar mensagens, inspecionar código e publicar.
- O OAuth aceita somente clientes aprovados pela Lovable. A Super Lovable precisa ser cadastrada/autorizada antes de ativar este adaptador.
- Segredos previstos: `LOVABLE_MCP_CLIENT_ID` e `LOVABLE_MCP_CLIENT_SECRET`.

### 3. Git Sync

- Alternativa oficial para projetos existentes.
- A aplicação já possui estrutura de GitHub App e OAuth individual.
- Requer vincular a licença, o usuário, o repositório e o projeto Lovable antes de gerar commits.

## Solicitação a enviar para a Lovable

Solicitar o cadastro da Super Lovable como cliente OAuth do Lovable MCP, informando:

- nome da aplicação: Super Lovable;
- tipo: extensão Chrome com backend próprio;
- finalidade: permitir que o próprio usuário envie mensagens para projetos da conta que ele autorizou;
- permissões desejadas: listar projetos, enviar mensagens, consultar execução, anexar referências e publicar somente mediante ação do usuário;
- autenticação: OAuth individual, sem compartilhamento de contas ou tokens;
- URL de callback HTTPS do backend;
- URL da política de privacidade e termos de uso;
- procedimento de exclusão de tokens e revogação da conexão.

Nunca solicitar ao cliente que copie cookies, tokens de sessão ou credenciais internas da Lovable.
