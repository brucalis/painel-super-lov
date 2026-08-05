# Super Lovable V2 — Integração com Supabase

## Objetivo

Permitir que a extensão conecte uma conta Supabase autorizada e centralize operações de backend sem expor credenciais no navegador ou no repositório.

## Fluxo previsto

1. Usuário clica em Conectar Supabase.
2. O backend abre o fluxo oficial de autorização.
3. O usuário escolhe a organização ou projeto permitido.
4. A extensão recebe apenas o estado da conexão e a lista de projetos autorizados.
5. Tokens sensíveis permanecem no backend da Super Lovable.

## Recursos cobertos

- inspeção do projeto;
- migrations;
- tabelas e esquema;
- políticas RLS;
- autenticação;
- Storage;
- Edge Functions;
- secrets;
- verificação de saúde e pendências.

## Regras de segurança

- service role key nunca fica na extensão;
- secrets nunca são gravados no GitHub;
- ações destrutivas exigem confirmação;
- migrations devem ser versionadas no repositório quando aplicável;
- operações precisam registrar auditoria;
- a extensão deve mostrar claramente quando uma ação pode gerar custo no Supabase;
- nenhuma dessas ações usa o chat ou os créditos de construção da Lovable.

## Endpoints provisórios

- `POST /api/supabase/connect`
- `GET /api/supabase/status`
- `GET /api/supabase/projects`
- `GET /api/supabase/projects/{ref}/inspect`
- `POST /api/supabase/projects/{ref}/actions`

## Dados reais necessários posteriormente

- URL pública do backend;
- mecanismo oficial de autorização Supabase;
- formato das respostas dos endpoints;
- política de projetos e organizações permitidos;
- sistema de armazenamento seguro dos tokens;
- estratégia para aplicar migrations;
- estratégia para cadastrar secrets;
- logs e auditoria.
