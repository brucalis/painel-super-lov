# Extensão Super Lovable — fonte oficial

Este repositório (`brucalis/painel-super-lov`) é a fonte oficial de produção do conjunto completo:

- painel administrativo e licenças;
- APIs públicas usadas pela extensão;
- home e arquivo de download;
- código-fonte da extensão em `extension/`.

O repositório `brucalis/superlovable-app` deve ser tratado apenas como histórico de origem. Novas alterações de produção devem ser feitas aqui.

## Publicação de uma nova versão

1. Alterar somente os arquivos necessários dentro de `extension/`.
2. Atualizar `extension/manifest.json`.
3. Executar verificação de sintaxe em todos os arquivos JavaScript da extensão.
4. Gerar `public/super-lovable.zip` diretamente do conteúdo de `extension/`.
5. Atualizar versão, data, nome do ZIP e changelog em `src/lib/extension-release.ts`.
6. Executar `npm run build` e validar a integridade do ZIP.
7. Publicar o projeto no Lovable para atualizar a home e as APIs.

O ZIP não deve incluir `.git`, arquivos temporários ou código que não esteja versionado em `extension/`.

## Lovable AI

O botão **Otimizar** chama `/api/public/optimize-prompt`. Essa rota pertence ao backend deste projeto, valida a licença e usa a `LOVABLE_API_KEY` apenas no servidor. A extensão nunca deve receber essa chave nem usar o token ou os créditos do projeto Lovable aberto pelo cliente.
