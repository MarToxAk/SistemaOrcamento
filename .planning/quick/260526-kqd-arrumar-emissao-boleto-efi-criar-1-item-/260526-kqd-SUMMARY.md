---
id: 260526-kqd
status: complete
description: Arrumar emissao boleto EFI - criar 1 item por venda_item seguindo logica NFS-e
date: 2026-05-26
---

# Quick Task 260526-kqd — Resumo

## O que foi feito

Substituída a montagem de itens EFI no boleto. Antes: agregava por número de NF-e/NFS-e (`NF-e #420`, `NFS-e #171`). Depois: **1 item EFI por `venda_item` do Athos** com nome do produto/serviço, quantidade real e valor proporcional ao(s) título(s) selecionado(s) — mesma fonte (`venda_item JOIN produto`) usada pela emissão de NFS-e.

## Arquivos alterados

- `apps/backend/src/modules/integrations/athos/athos.service.ts`
  - `buscarItensVenda(idvenda)` → retorna `{ nome, quantidade, valor, tipoFisico, sequencia }[]` para TODOS os itens da venda.
  - `buscarValorTotalVenda(idvenda)` → retorna `valortotal` da venda (denominador para títulos parciais/parcelas).
- `apps/backend/src/modules/cobranca/cobranca.service.ts`
  - Novo `montarItensEfiPorVendaItem(titulos, totalValor)`: agrupa títulos por venda, aplica fator de proporção (`Σ valor_titulos_da_venda / valortotal_venda`), gera item EFI por `venda_item`, garante `Σ items.value === Math.round(totalValor * 100)` ajustando o último item.
  - `criarBoleto` e `previewBoleto` usam o novo método. Removida a lógica de agrupamento por NF-e/NFS-e number e os splits via `verificarTipoProdutoVenda`.
  - Fallback: se a venda não retornar itens ou `valortotal <= 0`, emite 1 item agregado (`Venda #<id>`) com o valor do título — preserva geração do boleto.
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
  - Tipo `boletoPreview.itens` aceita `quantidade?`.
  - Modal mostra `×N` ao lado do nome quando `quantidade > 1`.

## Invariantes preservadas

- `Σ items[].value === round(totalValor * 100)` (regra EFI).
- Validação "boleto requer NF emitida" mantida via `verificarNFTitulos` + checagem de `NfseEmitida` local.
- `previewBoleto` e `criarBoleto` usam a mesma fonte → o que aparece no preview é o que vai pra EFI.

## Comportamento esperado

Payload EFI agora reflete os produtos/serviços reais da venda, ex.:
```json
"items": [
  { "name": "Carimbo automático Trodat 4912", "value": 4500, "amount": 1 },
  { "name": "Serviço de gravação", "value": 2500, "amount": 1 }
]
```

## Notas

- `verificarTipoProdutoVenda` e `buscarTodasNfesParaTitulos` continuam existindo (são usadas em outros pontos — emissão de NFS-e). Não foram removidas.
- O check de TypeScript passa em backend e frontend (`tsc --noEmit`).
