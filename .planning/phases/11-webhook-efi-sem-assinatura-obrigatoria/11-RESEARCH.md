# Phase 11 Research - Webhook EFI sem assinatura obrigatoria

## Goal

Planejar uma alteracao segura para aceitar webhook EFI sem assinatura obrigatoria, sem perder protecoes ja existentes de resiliencia e auditoria.

## Findings

### 1. Bloqueio atual de assinatura
- `apps/backend/src/modules/integrations/efi/efi.controller.ts` usa `@UseGuards(EfiWebhookGuard)` em ambos endpoints de webhook.
- `apps/backend/src/modules/security/efi-webhook.guard.ts` rejeita request sem header de assinatura e sem `EFI_WEBHOOK_SECRET`.
- Resultado: sem assinatura, request recebe 401 antes de chegar ao `EfiService.processWebhook`.

### 2. Resiliencia ja existente e reutilizavel
- Endpoints possuem `@Throttle({ default: THROTTLE_WEBHOOK })`, mitigando spam bruto.
- `processWebhook` implementa idempotencia por `eventId`/`externalId` em `PaymentTransaction`.
- Mesmo com retransmissoes da EFI, eventos duplicados ja sao ignorados.

### 3. Auditoria e metadados
- Em cada transacao nova, `processWebhook` salva `metadata.signature`.
- Quando assinatura nao for enviada, o metadado pode permanecer `null` sem quebrar persistencia.
- Isso atende rastreabilidade sem exigir HMAC obrigatorio.

### 4. Fail-fast de ambiente
- `apps/backend/src/modules/app.module.ts` ainda exige `EFI_WEBHOOK_SECRET` em `REQUIRED_ENV_VARS`.
- Com a mudanca de estrategia, manter essa obrigatoriedade contradiz o objetivo da fase 11.

## Recommended Planning Strategy

1. Plano 11-01 (wave 1): remover bloqueio por assinatura no endpoint e ajustar validacao de env.
2. Plano 11-02 (wave 2): ampliar testes para garantir aceite sem assinatura + preservacao de idempotencia/auditoria.

## Validation Targets

- EFIW-01: webhook aceito sem assinatura.
- EFIW-02: throttle e idempotencia continuam efetivos.
- EFIW-03: registro de transacoes continua com metadata/auditoria coerentes.

## Risks and Mitigations

- Risco: aumento de trafego malicioso no endpoint publico.
  - Mitigacao: manter throttle especifico de webhook e idempotencia para reduzir impacto de repeticao.

- Risco: regressao silenciosa no processamento por alteracao de guard/controller.
  - Mitigacao: testes unitarios de controller e service cobrindo requests sem assinatura e duplicados.

- Risco: ambiente de producao ainda exigir `EFI_WEBHOOK_SECRET` no bootstrap.
  - Mitigacao: remover do bloco de variaveis obrigatorias mantendo compatibilidade opcional.

## Out of Scope in Phase 11

- Conciliacao de pagamento no Athos.
- Gatilhos de checagem de pagamento ao abrir/enviar orcamento.
- Desconto na emissao de NFS-e.
