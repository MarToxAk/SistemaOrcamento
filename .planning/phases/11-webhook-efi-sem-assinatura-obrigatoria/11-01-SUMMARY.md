# 11-01 SUMMARY - Webhook EFI sem assinatura obrigatoria

## Status
COMPLETE

## Artifacts Created / Modified
- apps/backend/src/modules/integrations/efi/efi.controller.ts
- apps/backend/src/modules/app.module.ts
- apps/backend/src/modules/security/efi-webhook.guard.ts

## Changes Delivered
- Removido `@UseGuards(EfiWebhookGuard)` dos endpoints publicos de webhook EFI (`/webhook/payment` e `/webhook/payment/pix`).
- Mantido throttle de webhook em ambos endpoints para resiliencia operacional.
- `EFI_WEBHOOK_SECRET` removido do fail-fast de ambiente em `REQUIRED_ENV_VARS`.
- Guard ajustado para assinatura opcional:
  - sem assinatura: request permitido
  - com assinatura e sem segredo: request permitido
  - com assinatura e segredo: validacao HMAC mantida
  - assinatura invalida com segredo: continua bloqueando

## Decisions Honored
- D-01: assinatura deixa de ser gate obrigatorio
- D-02: resiliencia minima mantida via throttle e fluxo idempotente no service
- D-04: bootstrap nao exige `EFI_WEBHOOK_SECRET` para subir

## Verification
- Build backend executado com sucesso: `npm --workspace @bomcusto/backend run build`
- Checagem de codigo confirma ausencia de `UseGuards(EfiWebhookGuard)` no controller de webhook
