# Phase 11: Webhook EFI sem assinatura obrigatoria - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Source:** /gsd-plan-phase 11

<domain>
## Phase Boundary

Permitir que os endpoints de webhook da EFI recebam notificacoes sem depender de assinatura HMAC obrigatoria, mantendo resiliencia operacional (throttle, idempotencia e rastreabilidade de eventos).

Esta fase cobre apenas o fluxo de entrada e processamento do webhook EFI.
Nao inclui conciliacao Athos (fase 12) nem gatilhos de checagem de pagamento no fluxo de orcamento (fase 13).
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- D-01: Assinatura em headers (`x-signature`/`x-gn-signature`) deixa de ser requisito bloqueante para aceitar webhook.
- D-02: Resiliencia minima deve permanecer: throttle nos endpoints e idempotencia por `eventId`/`externalId` no processamento.
- D-03: Eventos processados devem continuar com trilha de auditoria em `PaymentTransaction` com metadados do webhook.
- D-04: Fail-fast de ambiente nao deve exigir `EFI_WEBHOOK_SECRET` como variavel obrigatoria para subir a API.

### Claude's Discretion
- Escolher entre remover completamente o guard do endpoint ou tornalo opcional sem bloquear requests sem assinatura.
- Definir cobertura de testes mais eficaz (controller + service) para garantir regressao zero no processamento.
</decisions>

<canonical_refs>
## Canonical References

### Backend - EFI webhook
- apps/backend/src/modules/integrations/efi/efi.controller.ts - endpoints publicos de webhook
- apps/backend/src/modules/integrations/efi/efi.service.ts - `processWebhook`, idempotencia e persistencia
- apps/backend/src/modules/integrations/efi/efi.webhook.test.ts - suite atual de testes do processamento

### Seguranca e bootstrap da aplicacao
- apps/backend/src/modules/security/efi-webhook.guard.ts - validacao HMAC atual
- apps/backend/src/modules/security/security.module.ts - providers/exports de guards
- apps/backend/src/modules/app.module.ts - validacao de env vars obrigatorias (inclui EFI_WEBHOOK_SECRET hoje)
- apps/backend/src/modules/security/throttle.config.ts - throttle especifico de webhook

### Escopo oficial
- .planning/ROADMAP.md - fase 11 e criterios de sucesso
- .planning/REQUIREMENTS.md - EFIW-01, EFIW-02, EFIW-03
</canonical_refs>

<specifics>
## Specific Ideas

- Remover `@UseGuards(EfiWebhookGuard)` dos endpoints `/integrations/efi/webhook/payment` e `/pix`.
- Manter `@Throttle({ default: THROTTLE_WEBHOOK })` para reduzir abuso externo.
- Garantir que `processWebhook` siga recebendo assinatura opcional para metadados (`validated: false` e `signature: null` quando ausente).
- Garantir que `EFI_WEBHOOK_SECRET` continue disponivel de forma opcional para cenarios futuros, sem quebrar startup.
</specifics>

<deferred>
## Deferred Ideas

- Whitelist de IP de origem da EFI em nivel de infraestrutura.
- Assinatura opcional com metricas de confianca por origem.
- Endpoint separado para modo "strict signature" por tenant.
</deferred>

---
*Phase: 11-webhook-efi-sem-assinatura-obrigatoria*
*Context gathered: 2026-05-04 via plan-phase*
