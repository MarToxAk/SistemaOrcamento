---
status: testing
phase: 02-confiabilidade-de-integracoes
source:
  - .planning/phases/02-confiabilidade-de-integracoes/02-01-SUMMARY.md
started: 2026-05-02T00:00:00Z
updated: 2026-05-02T00:00:00Z
---

## Current Test

number: 1
name: GET /api/health retorna status de cada integração
expected: |
  Chamar GET http://localhost:4000/api/health (sem autenticação — rota pública).
  O response deve ter:
  - campo `status` com valor "ok" ou "degraded"
  - campo `integrations` com subchaves `db`, `chatwoot` e `nfse`
  - cada subchave com `ok: true` ou `ok: false`
  Exemplo mínimo: { "status": "ok", "integrations": { "db": { "ok": true }, "chatwoot": { "ok": ... }, "nfse": { "ok": ... } } }
awaiting: user response

## Tests

### 1. GET /api/health retorna status de cada integração
expected: |
  Chamar GET http://localhost:4000/api/health (sem autenticação — rota pública).
  O response deve ter:
  - campo `status` com valor "ok" ou "degraded"
  - campo `integrations` com subchaves `db`, `chatwoot` e `nfse`
  - cada subchave com `ok: true` ou `ok: false`
  Exemplo mínimo: { "status": "ok", "integrations": { "db": { "ok": true }, "chatwoot": { "ok": ... }, "nfse": { "ok": ... } } }
result: [pending]

### 2. POST /api/quotes/:id/enviar retorna { queued: true } imediatamente
expected: |
  Chamar POST http://localhost:4000/api/quotes/<qualquer-id>/enviar com o header x-internal-api-key.
  O endpoint deve retornar imediatamente (< 2 segundos) com:
  { "queued": true, "quoteId": "<id>" }
  Não deve ficar aguardando processamento de PDF ou envio Chatwoot.
  (O quoteId pode ser inválido — o importante é o retorno imediato com queued: true)
result: [pending]

### 3. Logs de erro de integração contêm quoteId e nome da operação
expected: |
  Verificação por código: os serviços de integração (Chatwoot, EFI, NFS-e) usam
  NestJS Logger com contexto.
  Em quotes.controller.ts, o catch do fire-and-forget loga: "[enviarParaCliente] erro background quoteId=<id>: <mensagem>".
  No chatwoot.service.ts, erros nas chamadas de API usam logger.error/logger.warn.
  Confirme: o arquivo apps/backend/src/modules/common/logging.interceptor.ts existe,
  e apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts tem `private readonly logger`.
result: [pending]

### 4. NFS-e com tomador sem CPF/CNPJ → 400 com mensagem clara em português
expected: |
  O serviço nfse.service.ts valida que CPF ou CNPJ é obrigatório.
  Se nenhum documento for informado, lança BadRequestException com a mensagem:
  "CPF ou CNPJ do cliente é obrigatório para emitir NFS-e em Ilhabela. Informe o documento no campo correspondente."
  O endpoint retorna HTTP 400.
  (Verificação por código — não requer chamada real ao endpoint de NFS-e)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
