# Summary - 01-02

## Objective
Hardening de endpoints sensiveis com assinatura de webhook EFI e throttling.

## Implemented
- Criado `EfiWebhookGuard` com validacao HMAC-SHA256 usando `EFI_WEBHOOK_SECRET`.
- Webhooks EFI marcados como publicos, mas protegidos por `EfiWebhookGuard`.
- Instalado e configurado `@nestjs/throttler`.
- `ThrottlerGuard` registrado globalmente.
- Regras de throttle adicionadas para:
  - webhooks EFI
  - emissao NFS-e
  - geracao de PDF em quotes
- Rota de aprovacao de orcamento (`POST /quotes/:id/approve`) marcada com `@Public()`.

## Files
- apps/backend/src/modules/security/efi-webhook.guard.ts
- apps/backend/src/modules/security/throttle.config.ts
- apps/backend/src/modules/integrations/efi/efi.controller.ts
- apps/backend/src/modules/integrations/nfse/nfse.controller.ts
- apps/backend/src/modules/quotes/quotes.controller.ts
- apps/backend/src/modules/app.module.ts
- apps/backend/package.json
- package-lock.json

## Verification
- `npm --workspace @bomcusto/backend run prisma:generate` ✅
- `npm --workspace @bomcusto/backend run build` ✅

## Notes
- Dependencia `@nestjs/throttler` foi instalada com `--legacy-peer-deps` devido conflito de peer deps preexistente no projeto (`@nestjs/common` 10.x e `@nestjs/core` 11.x).
