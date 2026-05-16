---
slug: security-webhook-token-fixes
date: 2026-05-15
status: complete
---

# Resumo — Correções de segurança webhook EFI e token Athos

## O que foi feito

**Fix 1 — EFI Webhook Guard (CRÍTICO)**
- Arquivo: `apps/backend/src/modules/security/efi-webhook.guard.ts`
- Linha 28: `return true` → `throw new InternalServerErrorException(...)`
- Guard agora rejeita requisições com assinatura quando `EFI_WEBHOOK_SECRET` não está configurado, em vez de aceitar silenciosamente.
- Commit: `fix(security): reject EFI webhook when secret is unconfigured`

**Fix 2 — Athos Controller (ALTO)**
- Arquivo: `apps/backend/src/modules/integrations/athos/athos.controller.ts`
- Substituída comparação `provided !== requiredToken` por `timingSafeEqual` do Node crypto.
- Padrão agora consistente com `EfiWebhookGuard`.
- Commit: `fix(security): use timingSafeEqual for Athos token comparison`

## Resultado
Ambos os problemas críticos/altos de segurança identificados no mapeamento do codebase foram corrigidos em commits atômicos separados.
