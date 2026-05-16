---
phase: 23
plan: 01
status: complete
date: 2026-05-16
---

# Fase 23 — Plano 01: Hardening do AthosListenerService

## Resultado

Todos os 4 requisitos de hardening concluídos.

## O que foi feito

### CAIXA-01 — Reconexão automática com backoff exponencial
- Extraída lógica de conexão para método privado `connect()`
- Implementado `scheduleReconnect()` com delay `Math.min(2^n * 1s, 30s)`
- Handler `client.on("error")` seta `client=null` e agenda reconexão
- Flag `enabled` garante que reconnect não dispara após `onApplicationShutdown()`
- Commit: `fix(athos-listener): reconexão automática com backoff exponencial (CAIXA-01)`

### CAIXA-02 — Notificação Chatwoot ao pagar no caixa
- Já implementado via `quotesService.confirmarPagamentoCaixa()` (quick task 260514-002)
- `handleNotification()` delega ao QuotesService (fire-and-forget com catch isolado)
- Nenhuma duplicação necessária

### CAIXA-03 — Proteger SSE /pagamentos com x-internal-api-key
- Removido `@Public()` do `GET /events/pagamentos`
- `InternalAuthGuard` (timingSafeEqual, já existente) passa a valer
- Import não usado de `Public` removido do controller
- Proxy frontend (`app/api/events/pagamentos/route.ts`) já envia `x-internal-api-key`
- Commit: `fix(events): proteger SSE /pagamentos com x-internal-api-key (CAIXA-03)`

### CAIXA-04 — Testes unitários do AthosListenerService
- Criado `athos-listener.service.test.ts` com 10 cenários
- Bootstrap sem vars desativado, connect+LISTEN, handlers registrados
- handleNotification: caixa detectado, não-caixa, relação vazia, erro de persist (SSE ainda emitido)
- Reconexão: scheduleReconnect chamado ao error, shutdown limpa timer
- Fake timers usados nos testes de reconexão para evitar leak
- Commit: `test(athos-listener): cobertura de reconexão, caixa e Chatwoot (CAIXA-04)`

## Critérios de Sucesso

| Critério | Status |
|----------|--------|
| PG restart → listener reconecta em até 30s | ✅ (backoff max 30s implementado) |
| Pagamento no caixa → Chatwoot notificado | ✅ (via QuotesService) |
| GET /api/events/pagamentos → 401 sem x-internal-api-key | ✅ (@Public() removido) |
| npx jest athos-listener --no-coverage → 0 falhas | ✅ (10 testes passando) |
| Suite completa backend sem erros | ✅ (122/122 passando) |

## Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `apps/backend/src/modules/integrations/athos/athos-listener.service.ts` | Reconexão automática + `enabled` flag |
| `apps/backend/src/modules/events/events.controller.ts` | Removido `@Public()` + import |
| `apps/backend/src/modules/integrations/athos/athos-listener.service.test.ts` | Criado — 10 testes |
