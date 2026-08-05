# Super Lovable V2 — Preview e Diff

## Objetivo
Garantir que nenhuma alteração seja aplicada sem o usuário visualizar antes o impacto planejado.

## Contrato esperado do agente
O planejamento deve devolver `preview` com:
- resumo;
- arquivos afetados;
- ação por arquivo;
- motivo da alteração;
- adições e exclusões estimadas;
- diff textual;
- avisos;
- validações previstas.

## Fluxo
1. A tarefa é planejada.
2. O agente devolve plano e preview.
3. A extensão salva ambos na tarefa.
4. O modal mostra arquivos e diferenças.
5. O usuário pode voltar ou confirmar.
6. Somente após a confirmação começa a edição real.
7. O commit final continua registrando os arquivos realmente modificados e os resultados de validação.

## Limite do simulador
Enquanto o backend real não estiver conectado, o diff exibido é ilustrativo. Em produção, ele deverá ser gerado a partir do conteúdo real da branch e da proposta de alteração preparada pelo agente.
