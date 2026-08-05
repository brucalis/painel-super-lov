# Super Lovable V2 — Memória do projeto

## Objetivo

Manter um contexto persistente separado por repositório e branch, para que novas tarefas respeitem decisões, identidade visual, público, tecnologias e restrições já definidas.

## Escopo salvo

- nome da marca;
- identidade visual;
- cores e tipografia;
- direção de imagens;
- público;
- tom de comunicação;
- objetivo do produto;
- tecnologias;
- regras permanentes;
- restrições;
- integrações conectadas;
- arquivos importantes;
- observações;
- decisões anteriores.

## Isolamento

A chave lógica da memória é:

```text
repository + branch
```

Assim, a branch `main` pode ter regras diferentes de uma branch de testes.

## Uso nas tarefas

Antes de criar o plano, o orquestrador:

1. identifica repositório e branch;
2. carrega a memória correspondente;
3. gera um snapshot compacto;
4. envia o snapshot ao agente de edição;
5. salva o snapshot na tarefa para auditoria.

A memória não é enviada ao chat da Lovable.

## Segurança

Não devem ser salvos neste módulo:

- tokens;
- senhas;
- chaves secretas;
- service role;
- dados completos de clientes;
- credenciais de pagamento.

Secrets permanecem no backend seguro ou no provedor correspondente.

## Limites locais

- até 60 decisões por projeto e branch;
- até 40 arquivos importantes;
- listas deduplicadas e normalizadas;
- textos limitados para evitar crescimento ilimitado do armazenamento local.

## Futuro backend

Na integração real, a memória poderá ser sincronizada com a conta do usuário para sobreviver à troca de navegador ou computador. A extensão continuará usando cache local para abertura rápida.
