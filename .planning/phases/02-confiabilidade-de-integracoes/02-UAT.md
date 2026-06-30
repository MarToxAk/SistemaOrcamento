---
status: complete
phase: 02-confiabilidade-de-integracoes
source:
  - .planning/phases/02-confiabilidade-de-integracoes/02-01-SUMMARY.md
  - .planning/phases/02-confiabilidade-de-integracoes/02-02-SUMMARY.md
started: 2026-05-02T00:00:00Z
updated: 2026-05-03T16:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. GET /api/health retorna status de cada integração
expected: |
  Chamar GET http://localhost:4000/api/health (sem autenticação — rota pública).
  O response deve ter:
  - campo `status` com valor "ok" ou "degraded"
  - campo `integrations` com subchaves `db`, `chatwoot` e `nfse`
  - cada subchave com `ok: true` ou `ok: false`
  Exemplo mínimo: { "status": "ok", "integrations": { "db": { "ok": true }, "chatwoot": { "ok": ... }, "nfse": { "ok": ... } } }
result: pass

### 2. POST /api/quotes/:id/enviar retorna { queued: true } imediatamente
expected: |
  Chamar POST http://localhost:4000/api/quotes/<qualquer-id>/enviar com o header x-internal-api-key.
  O endpoint deve retornar imediatamente (< 2 segundos) com:
  { "queued": true, "quoteId": "<id>" }
  Não deve ficar aguardando processamento de PDF ou envio Chatwoot.
  (O quoteId pode ser inválido — o importante é o retorno imediato com queued: true)
result: pass

### 3. Logs de erro de integração contêm quoteId e nome da operação
expected: |
  Verificação por código: os serviços de integração (Chatwoot, EFI, NFS-e) usam
  NestJS Logger com contexto.
  Em quotes.controller.ts, o catch do fire-and-forget loga: "[enviarParaCliente] erro background quoteId=<id>: <mensagem>".
  No chatwoot.service.ts, erros nas chamadas de API usam logger.error/logger.warn.
  Confirme: o arquivo apps/backend/src/modules/common/logging.interceptor.ts existe,
  e apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts tem `private readonly logger`.
result: pass

### 4. NFS-e com tomador sem CPF/CNPJ → 400 com mensagem clara em português
expected: |
  O serviço nfse.service.ts valida que CPF ou CNPJ é obrigatório.
  Se nenhum documento for informado, lança BadRequestException com a mensagem:
  "CPF ou CNPJ do cliente é obrigatório para emitir NFS-e em Ilhabela. Informe o documento no campo correspondente."
  O endpoint retorna HTTP 400.
  (Verificação por código — não requer chamada real ao endpoint de NFS-e)
result: issue
reported: "No caso os campos obrigatorios é os itens acho que faltou a parte de endereço para preencher caso não tenho associado no cadastro."
severity: major

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Emissão de NFS-e deve permitir preencher endereço do tomador quando não houver cadastro associado no Athos"
  status: resolved
  reason: "User reported: No caso os campos obrigatorios é os itens acho que faltou a parte de endereço para preencher caso não tenho associado no cadastro."
  severity: major
  test: 4
  fix_plan: "02-02-PLAN.md"
  fix_summary: "02-02-SUMMARY.md"
  resolved_by: "plano 02-02 — campos de endereço adicionados no modal NFS-e e no contrato backend"
  root_cause: "Fluxo de consulta/ emissão expõe apenas nome e documento do tomador; endereço não é retornado pelo backend em consultar() nem coletado/enviado pelo modal de NFS-e no frontend."
  fixed:
    - "consultar() agora retorna tomador.endereco e tomador.temEndereco"
    - "emitir() aceita campos manuais de endereço do tomador no body"
    - "Modal NFS-e exibe e envia logradouro, número, bairro, CEP, codigoMunicipio, UF"
    - "Validação backend retorna 400 com mensagem em pt-BR quando endereço mínimo ausente em emissão manual"
    - "Enviar endereco no POST /api/quotes/:id/nfse quando documento for manual"
    - "Validar e mostrar erro claro quando faltar endereço obrigatório para emissão"
  fix_plan: ".planning/phases/02-confiabilidade-de-integracoes/02-02-PLAN.md"
  fix_status: "implemented-pending-uat-retest"
  debug_session: ".planning/phases/02-confiabilidade-de-integracoes/02-UAT.md"
