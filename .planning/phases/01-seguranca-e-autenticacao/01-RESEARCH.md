# Phase 1 Research - Seguranca e Autenticacao

**Date:** 2026-05-01
**Phase:** 1 - Seguranca e Autenticacao

## Objective
Responder: o que precisa estar claro para planejar a fase de seguranca sem quebrar o fluxo atual de orcamentos.

## Current State (code-confirmed)
- Backend NestJS sem autenticacao/autorizações em controllers.
- `app.enableCors()` sem allowlist.
- Sem throttling global (`@nestjs/throttler` nao instalado/configurado).
- Webhooks EFI aceitam payload e repassam assinatura sem bloqueio explicito no controller.
- `ConfigModule.forRoot` sem schema de validacao de env em bootstrap.

Arquivos inspecionados:
- `apps/backend/src/main.ts`
- `apps/backend/src/modules/app.module.ts`
- `apps/backend/src/modules/quotes/quotes.controller.ts`
- `apps/backend/src/modules/integrations/efi/efi.controller.ts`
- `apps/backend/src/modules/integrations/nfse/nfse.controller.ts`
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.controller.ts`
- `apps/backend/src/modules/integrations/pdv/pdv.controller.ts`

## Locked Decisions Applied
- D-01: IdP de contexto: Chatwoot (sem auth própria).
- D-02: Protecao por padrao, excecoes publicas explicitas.
- D-03: Webhook EFI com HMAC-SHA256 via `x-gn-signature`.
- D-04: fail-fast de env obrigatorio em startup.
- D-05: rate limit em endpoints sensiveis.
- D-06: nao alterar regras NFS-e de dominio fiscal.

## Technical Approach

### 1) Autenticacao por API key interna (Chatwoot-context)
- Criar guard global `InternalAuthGuard` via `APP_GUARD`.
- Header recomendado: `x-internal-api-key` com comparacao em tempo constante.
- Segredo via `INTERNAL_API_KEY` no `.env`.
- Rotas publicas marcadas com decorator `@Public()` e metadata de bypass.

Justificativa:
- Implementacao simples, baixa friccao, sem sessao/JWT nessa fase.
- Mantem aderencia ao contexto Chatwoot (acesso apenas ambiente interno).

### 2) Verificacao obrigatoria do webhook EFI
- Guard/decorator dedicado no endpoint EFI para validar assinatura HMAC.
- Rejeitar 401 se header ausente/invalido antes de tocar service.
- Chave de assinatura via `EFI_WEBHOOK_SECRET`.

### 3) Fail-fast de configuracao
- Adicionar validacao de env no `ConfigModule.forRoot` com schema.
- Campos criticos minimos:
  - `DATABASE_URL`
  - `INTERNAL_API_KEY`
  - `EFI_WEBHOOK_SECRET`
  - `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`
  - `NFSE_TOKEN`
- Startup deve falhar com mensagem clara listando missing vars.

### 4) Throttling de endpoints sensiveis
- Instalar/configurar `@nestjs/throttler`.
- Aplicar regras estritas em:
  - `/api/integrations/efi/webhook/*`
  - `/api/quotes/:id/nfse`
  - `/api/quotes/:id/pdf`
- Demais endpoints com limite padrao moderado.

## Security Notes (STRIDE)
- Spoofing: mitigado por guard global + assinatura webhook.
- Tampering: assinatura webhook evita payload forjado.
- Repudiation: fase atual prepara base; auditoria completa fica fase posterior.
- Information disclosure: CORS allowlist reduz risco de origem indevida.
- DoS: throttling reduz abuso de webhook/PDF/NFS-e.
- Elevation of privilege: `@Public` apenas em rotas explicitamente permitidas.

## Risks
- Breaking change para frontend se header `x-internal-api-key` nao for adicionado nas rotas proxy do Next.
- Webhook EFI pode variar nomenclatura de header; manter fallback `x-signature` somente durante transicao, com log de deprecacao.
- Throttling agressivo pode bloquear operacao legitima em pico.

## Recommended Plan Split
- Plan 01: Fundacao de seguranca (guard global + public decorator + env validation + CORS).
- Plan 02: Endpoint hardening (EFI webhook signature + throttling + anotacao de rotas publicas/sensiveis + smoke tests).

## Verification Commands Candidates
- `npm --workspace @bomcusto/backend run build`
- `npm --workspace @bomcusto/backend run test` (ainda limitado no projeto)
- `curl` smoke checks em ambiente local para 401/200 conforme rotas

---
*Research completed: 2026-05-01*