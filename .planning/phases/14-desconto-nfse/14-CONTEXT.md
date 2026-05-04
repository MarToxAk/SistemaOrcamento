# Phase 14 — Desconto Controlado na Emissão de NFS-e

## Goal
Permitir que o operador informe um desconto (percentual ou valor fixo) ao emitir uma NFS-e,
populando corretamente o campo `DescontoIncondicionado` no XML do RPS conforme a norma ABRASF v2.04.

## Requirements
- NFSD-01: Campo booleano `descontoAtivo` para ativar/desativar o desconto
- NFSD-02: Desconto por percentual (`descontoPorcentagem` 0–100) calculado sobre `totalPago` ou `valorServicos`
- NFSD-03: Desconto por valor fixo em reais (`descontoValor`)
- NFSD-04: Validações impedem desconto inválido (negativo, maior que base, percentual acima de 100)
- NFSD-05: XML da NFS-e preenche `DescontoIncondicionado` dinamicamente quando a flag estiver ativa

## Scope
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts`
  - Interface `EmitirNfseInput`: novos campos de desconto
  - `buildRpsXml()`: novo parâmetro `descontoIncondicionado`; XML dinâmico
  - `emitir()`: bloco de cálculo e validação de desconto
- `apps/backend/src/modules/integrations/nfse/nfse.discount.test.ts` (novo)

## Context
- `ValorServicos` no XML é o valor **bruto** (pré-desconto); o servidor calcula `ValorLiquidoNfse` automaticamente
- `DescontoIncondicionado` e `DescontoCondicionado` são `minOccurs="0"` no XSD — opcionais
- Usamos `DescontoIncondicionado` pois o desconto dado ao cliente é incondicional
- O endpoint existente `POST /quotes/:quoteId/nfse` aceita o body `EmitirNfseInput` — sem alteração na API pública
