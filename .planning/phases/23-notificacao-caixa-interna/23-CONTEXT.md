# Phase 23 — Notificação de Caixa Interna: Hardening do AthosListenerService

**Milestone:** v2.0 - Gestão Integrada Financeira e Caixa
**Status:** planning
**Date:** 2026-05-09

---

## Objetivo

Hardenar o `AthosListenerService` já existente: adicionar reconexão automática com backoff, notificação Chatwoot direta ao detectar pagamento no caixa, proteger o endpoint SSE e cobrir o serviço com testes unitários.

---

## Estado Atual (O Que Já Existe)

O `athos-listener.service.ts` foi implementado na v1.8 e substitui o `bridge.js` externo (n8n). Ele já faz:

| Funcionalidade | Arquivo | Status |
|---|---|---|
| LISTEN em `n8n_channel` via `pg.Client` dedicado | `athos-listener.service.ts:38` | ✅ implementado |
| Query `relacao_orcamento_venda` ORDER BY DESC LIMIT 1 | `:72` | ✅ implementado |
| Query `venda` para `numeroordem` e `idcaixamovimento` | `:85` | ✅ implementado |
| Filtra apenas pagamentos com `idcaixamovimento NOT NULL` | `:96` | ✅ implementado |
| Persiste `paymentNote` no Prisma Quote | `:106` | ✅ implementado |
| Emite evento SSE via `EventsService.emitCaixaPayment()` | `:109` | ✅ implementado |
| Keep-alive `SELECT 1` a cada 55s | `:50` | ✅ implementado |
| Graceful shutdown via `OnApplicationShutdown` | `:61` | ✅ implementado |
| Endpoint SSE `GET /api/events/pagamentos` | `events.controller.ts` | ✅ implementado |

---

## Gaps Identificados

### GAP-1: Sem reconexão automática
**Arquivo:** `athos-listener.service.ts:46`

O handler `client.on("error")` apenas loga. Se o PG cair (timeout, restart, rede), o listener morre silenciosamente e para de receber notificações.

```typescript
this.client.on("error", (err) => {
  this.logger.error(`Erro no client Athos listener: ${err.message}`);
  // sem reconnect
});
```

**Impacto:** Pagamentos feitos no caixa não disparam notificação até o próximo restart do backend.

---

### GAP-2: Sem notificação Chatwoot do listener
**Arquivo:** `athos-listener.service.ts`

O `APP_ARCHITECTURE.md` define: "Notifica o Front-end via WebSocket ou API interna." O SSE cobre o frontend interno. Mas o Chatwoot (notificação ao cliente no WhatsApp/chat) não é disparado pelo listener — apenas o `paymentNote` é gravado.

A notificação Chatwoot ao cliente era feita por outro path (quotes.service.ts) mas não há evidência de que o listener a dispara.

**Impacto:** Cliente não recebe mensagem automática quando paga no caixa.

---

### GAP-3: SSE endpoint sem autenticação
**Arquivo:** `events.controller.ts:12`

```typescript
@Public()
@Sse("pagamentos")
streamPagamentos()
```

Qualquer pessoa com acesso à rede pode escutar o stream SSE.

---

### GAP-4: Zero testes para AthosListenerService
**Nenhum arquivo de teste encontrado para** `athos-listener.service.ts`.

---

## Dependências Conhecidas

- `EventsService` — emissão SSE (já funcional)
- `PrismaService` — persistência `paymentNote` (já funcional)
- `ChatwootService` — notificação ao cliente (já funcional em outros contextos)
- `QuoteService` — busca de quote por `saleExternalId`/`externalQuoteId`

---

## Arquivos Relevantes

| Arquivo | Propósito |
|---------|-----------|
| `apps/backend/src/modules/integrations/athos/athos-listener.service.ts` | Listener principal (a modificar) |
| `apps/backend/src/modules/events/events.service.ts` | SSE stream |
| `apps/backend/src/modules/events/events.controller.ts` | Endpoint SSE (a proteger) |
| `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` | Envio de mensagem ao cliente |
| `apps/backend/prisma/schema.prisma` — modelo `Quote.paymentNote` | Persistência |
| `.planning/REFERENCE_BRIDGE.md` | Código bridge.js original de referência |
| `.planning/APP_ARCHITECTURE.md` | Regras de negócio definidas pelo produto |
