# Phase 46: Mensagem de orçamento ao cliente com desconto e acréscimo corretos - Context

**Gathered:** 2026-11-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A mensagem de orçamento enviada ao cliente (WhatsApp via Chatwoot) e a cobrança PIX (EFI) mostram valores corretos quando houve alteração de preço unitário no Balcão, desconto por item ou desconto geral, e acréscimo. Envio continua pelo Chatwoot (Evolution direta/sendPix fora do escopo). Testes e verificação SOMENTE no clone athos-teste (127.0.0.1:5440), nunca no Athos original.

</domain>

<decisions>
## Implementation Decisions

### Cálculo dos valores
- Preço original do item = `valoritem + valordesconto / quantidade`. No Athos `valordesconto` é o TOTAL da LINHA (evidência: orçamentos 25822: qtd 13, valoritem 1,00, valordesconto 13,00, preço tabela 2,00; 25877: qtd 200, valoritem 0,65, valordesconto 60,00, preço 0,95). Bug atual: `resolveItemPricing` (athos.service.ts) soma valordesconto ao unitário -> valor absurdo.
- Total cobrado (mensagem e PIX) = líquido: `valor - descontors + valoracrescimo` (cabeçalho Athos `valor` é BRUTO; ex. 25952: valor 583,00, descontors 58,30, líquido 524,70). Hoje o Quote usa `totais.valor` bruto.
- Preço unitário alterado PARA MAIS (1,00 -> 1,50): reproduzir no clone com item de teste e corrigir o que aparecer (25900 já calcula certo; usuário não informou orçamento com erro).
- Dado inconsistente (desconto > linha): manter comportamento atual (total da linha 0 + log de aviso).
- Reconciliação por item: qtd x valor original - desconto = total do item (orcamentovalorfinalitem).

### Mensagem ao cliente (WhatsApp via Chatwoot)
- Com desconto: linhas Subtotal, Desconto (-R$ x) e Total; nos itens com desconto mostrar preço original riscado e o novo. Sem desconto/acréscimo a mensagem permanece como hoje.
- Pix Copia e Cola em MENSAGEM SEPARADA contendo só o código; remover o texto "caso prefira copiar o código".
- Falha na mensagem separada: registrar aviso (logger.warn); o orçamento já foi enviado e o link PIX segue na mensagem principal.

### Testes e verificação
- Testes unitários com os casos reais 25822, 25877, 25952 e 25900.
- Refazer o clone athos-teste com dump atual (somente leitura no original; pg_dump <=14, rede do container orcamento-ts-webserver2).
- Gerar orçamentos de teste NO CLONE: (a) pela API/serviço da Fase 44 (desconto por item/global) e (b) por INSERT imitando o padrão do Balcão (valoritem = preço digitado, valordesconto = total da linha, orcamentovalorfinalitem = qtd x valoritem) para reproduzir o bug; rodar o fluxo de leitura/mensagem em cima deles e comparar valores esperados x obtidos.

### Claude's Discretion
Organização dos arquivos, nomes de helpers e formato exato do texto (desde que respeite as decisões acima).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/backend/src/modules/integrations/athos/athos.service.ts`: `resolveItemPricing`, `resolveItemTotal`, `applyItemCorrecao`, leitura de itens (linhas ~120-500).
- `apps/backend/src/modules/quotes/quotes.service.ts`: `buildPaymentMessage` (~1601), `enviarParaCliente` (~1700-1870), `computeAndValidateFinalItemPrice` (~1190), `mapQuoteToAthosMapped` (~2050), criação do Quote (~545-620, total = totais.valor bruto).
- `integrations/chatwoot/chatwoot.service.ts`: `sendOutgoingMessage`.
- Fase 44: `athos-orcamento.service.ts`, `athos-orcamento-calc.util.ts`, `athos-orcamento.clone.it.test.ts` (padrão de IT no clone com ATHOS_IT_CLONE=1).

### Established Patterns
- NestJS + Jest com pg falso; IT no clone com trava host/porta/db.

### Integration Points
- Mensagem enviada por Chatwoot em enviarParaCliente; cobrança PIX em efi.service createPixPaymentLink.

</code_context>

<specifics>
## Specific Ideas

- Orçamentos de referência (Athos produção, só leitura): 25822, 25877, 25952, 25951, 25900, 26047, 26109.

</specifics>

<deferred>
## Deferred Ideas

- Envio direto pela Evolution API / função sendPix (usuário tem vários canais; manter Chatwoot).

</deferred>
