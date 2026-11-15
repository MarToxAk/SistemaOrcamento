# Fase 49: Status ao cliente só no "pronto" e troca de status silenciosa - Contexto

**Reunido em:** 2026-11-15
**Status:** Pronto para planejar

## Limite da fase

Reduzir as mensagens de mudança de status enviadas ao cliente no WhatsApp (via Chatwoot) e permitir mudar status sem avisar o cliente, inclusive em massa, para evitar risco de ban.

## Decisões

- D-01: Em `QuotesService.changeStatus`, só PRONTO_PARA_ENTREGA envia mensagem pública ao cliente (texto atual). EM_PRODUCAO, ENTREGUE e CANCELADO passam a gerar nota privada (`postConversationNote`) com o mesmo texto.
- D-02: `PATCH /quotes/:id/status` ganha o campo opcional `notificarCliente` (boolean, padrão true). Com false, nenhuma mensagem pública é enviada (nem a de "pronto"); a nota privada de registro continua.
- D-03: Novo endpoint `PATCH /quotes/status/lote` (lista de orçamentos, novo status, `changedBy`). Sempre silencioso. Responde com o resultado por orçamento (ok ou erro de transição) e não para no primeiro erro.
- D-04: Outras mensagens automáticas ao cliente (pagamento confirmado no caixa nos 3 pontos, aprovação pelo cliente) ficam fora do escopo e não mudam.

## Código existente

- `apps/backend/src/modules/quotes/quotes.service.ts` (`changeStatus` ~911; notificação ~1011)
- `apps/backend/src/modules/quotes/quotes.controller.ts` (`PATCH :id/status`), `dto/update-status.dto.ts`
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` (`postConversationNote`, `sendOutgoingMessage`)
- Chamadas internas de `changeStatus` (APROVADO) devem manter o comportamento atual.

## Fora do escopo

Mensagens de pagamento confirmado e de aprovação; frontend.
