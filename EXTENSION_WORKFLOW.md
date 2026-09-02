# Extensão Super Lovable — fonte oficial

Este repositório (`brucalis/painel-super-lov`) é a fonte oficial de produção do conjunto completo:

- painel administrativo e licenças;
- APIs públicas usadas pela extensão;
- home e arquivo de download;
- código-fonte da extensão em `extension/`.

O repositório `brucalis/superlovable-app` deve ser tratado apenas como histórico de origem. Novas alterações de produção devem ser feitas aqui.

## Fluxo de alteração dos projetos

O fluxo padrão da Super Lovable é **aplicação direta na `main`**, sem Pull Request e sem branch temporária:

1. a extensão recebe o pedido do usuário;
2. o backend lê o repositório e envia o contexto necessário para a IA;
3. a IA devolve os arquivos completos que precisam ser alterados;
4. a validação estática bloqueia credenciais, arquivos protegidos, JSON inválido e operações destrutivas;
5. o backend cria um único commit com todos os arquivos da execução;
6. a referência da `main` é atualizada por fast-forward usando o token da GitHub App;
7. **nenhum Pull Request é criado** e nenhuma confirmação manual no GitHub faz parte do fluxo;
8. a Lovable recebe o commit pelo GitHub Sync;
9. o usuário apenas confere o preview e publica quando desejar.

Antes de gravar, o backend compara o SHA usado no planejamento com o SHA atual da `main`. Se o projeto tiver mudado nesse intervalo, a execução falha e pede para gerar o plano novamente, evitando sobrescrever alterações mais recentes.

O Build Runner não participa mais do caminho obrigatório de aplicação. A execução normal não pode ficar presa, virar revisão manual ou abrir PR por indisponibilidade do runner.

Se o GitHub impedir escrita direta por regra de proteção da `main`, a execução deve falhar com uma mensagem clara. **Nunca criar PR automaticamente como contingência.**

### Desfazer

O botão de desfazer também trabalha diretamente na `main`.

- somente os arquivos da execução original são revertidos;
- se algum desses arquivos tiver sido alterado depois, a reversão é bloqueada para não apagar trabalho mais recente;
- não é criado Pull Request para reversão.

## Publicação de uma nova versão

1. Alterar somente os arquivos necessários dentro de `extension/`.
2. Atualizar `extension/manifest.json` apenas quando um novo pacote distribuível for realmente gerado.
3. Executar verificação de sintaxe em todos os arquivos JavaScript da extensão.
4. Gerar `public/super-lovable.zip` diretamente do conteúdo de `extension/`.
5. Atualizar versão, data, nome do ZIP e changelog em `src/lib/extension-release.ts`.
6. Executar `npm run build` e validar a integridade do ZIP.
7. Publicar o projeto no Lovable para atualizar a home e as APIs.

O ZIP não deve incluir `.git`, arquivos temporários ou código que não esteja versionado em `extension/`.

## Lovable AI

O botão **Otimizar** chama primeiro a Edge Function `optimize-prompt` deste projeto Supabase e usa `/api/public/optimize-prompt` apenas como contingência. As duas rotas validam a licença e usam a `LOVABLE_API_KEY` somente no servidor. A extensão nunca deve receber essa chave nem usar o token, o chat ou os créditos do projeto Lovable aberto pelo cliente.

Antes de publicar a extensão, confirme que `supabase/functions/optimize-prompt-health` responde com `ok: true`. Se `ai_configured` estiver falso, configure `LOVABLE_API_KEY` nos segredos das Edge Functions do projeto principal.
