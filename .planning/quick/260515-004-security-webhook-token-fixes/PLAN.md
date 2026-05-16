---
slug: security-webhook-token-fixes
date: 2026-05-15
status: in-progress
---

# Correções de segurança — webhook EFI e token Athos

## Objetivo
Corrigir dois problemas de segurança identificados no mapa de codebase.

## Fix 1 — EFI Webhook Guard (CRÍTICO)
**Arquivo:** `apps/backend/src/modules/security/efi-webhook.guard.ts`
**Problema:** Linhas 27-29: quando `EFI_WEBHOOK_SECRET` não está configurado e o request tem uma assinatura, o guard retorna `true` (permite) em vez de rejeitar. Qualquer ator pode enviar webhooks de pagamento forjados.
**Correção:** Quando a assinatura está presente mas o secret não está configurado, lançar `InternalServerErrorException` (servidor mal configurado, não deve processar o webhook).

## Fix 2 — Athos Controller Token (ALTO)
**Arquivo:** `apps/backend/src/modules/integrations/athos/athos.controller.ts`
**Problema:** Linha 53: `provided !== requiredToken` é comparação de string com timing-unsafe. Permite ataque de timing oracle.
**Correção:** Substituir por `timingSafeEqual` do Node crypto, igual ao padrão já usado no `EfiWebhookGuard`.

## Commits planejados
1. `fix(security): reject EFI webhook when secret is unconfigured`
2. `fix(security): use timingSafeEqual for Athos token comparison`
