---
phase: 30-emissao-nfse-titulos
plan: "02"
subsystem: backend
tags: [nfse, cobranca, dto, nestjs, prisma]
dependency_graph:
  requires:
    - 30-01 (NfseService.emitirParaContaReceber, NfseEmitida.idvenda)
  provides:
    - EmitirNfseCobrancaDto (validação class-validator)
    - CobrancaService.emitirNfse()
    - POST /cobranca/nfse
    - CobrancaModule com NfseModule importado
  affects:
    - apps/backend/src/modules/cobranca/dto/emitir-nfse-cobranca.dto.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/backend/src/modules/cobranca/cobranca.module.ts
tech_stack:
  added: []
  patterns:
    - DTO com class-validator (padrão CriarBoletoDto)
    - Busca + filtro de títulos via AthosService (padrão criarBoleto)
    - Verificação de duplicidade por idvenda antes de emissão SOAP
    - Nested write Prisma (NfseEmitida + NfseEmitidaTitulo.createMany)
    - Try/catch com InternalServerErrorException (padrão criarBoleto)
key_files:
  created:
    - apps/backend/src/modules/cobranca/dto/emitir-nfse-cobranca.dto.ts
  modified:
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/backend/src/modules/cobranca/cobranca.module.ts
decisions:
  - "CobrancaService.emitirNfse() reutiliza exato padrão de criarBoleto() para busca + filtro de títulos"
  - "Verificação de duplicidade D-08 ocorre ANTES da chamada SOAP — evita emissão dupla e cobrança desnecessária"
  - "try/catch envolve apenas a chamada SOAP — BadRequestException de duplicidade propaga normalmente"
  - "POST /cobranca/nfse sem @Public() — InternalAuthGuard global protege automaticamente (T-30-05)"
metrics:
  duration: "~20min"
  completed: "2026-05-23"
  tasks: 2
  files: 4
---

# Phase 30 Plan 02: Endpoint POST /cobranca/nfse e CobrancaService.emitirNfse() Summary

**One-liner:** EmitirNfseCobrancaDto com class-validator, CobrancaService.emitirNfse() com verificação de duplicidade D-08/D-10 e nested write Prisma, endpoint POST /cobranca/nfse protegido por InternalAuthGuard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | EmitirNfseCobrancaDto + CobrancaModule com NfseModule | 6858268 | emitir-nfse-cobranca.dto.ts, cobranca.module.ts |
| 2 | CobrancaService.emitirNfse() + CobrancaController POST /cobranca/nfse | adbe3c4 | cobranca.service.ts, cobranca.controller.ts |

## Decisions Made

1. **Reutilização exata do padrão criarBoleto()** — O método `emitirNfse()` segue passo a passo o mesmo fluxo de `criarBoleto()`: buscar todos os títulos do cliente, filtrar pelos IDs solicitados, validar cada ID individualmente com `BadRequestException`. Isso garante consistência e facilita manutenção.

2. **Verificação de duplicidade antes da chamada SOAP** — A checagem `nfseEmitida.findFirst({ where: { idvenda } })` ocorre antes de qualquer chamada ao serviço SOAP iiBrasil. Isso evita emissão dupla de NFS-e e não gera custo de emissão em caso de duplicidade. Quando `idvenda` é `null` (D-10), a verificação é pulada completamente.

3. **try/catch envolve apenas o bloco SOAP** — O `catch` captura erros da chamada `emitirParaContaReceber()` e os transforma em `InternalServerErrorException("Não foi possível emitir a NFS-e.")`. Erros de duplicidade ou título não encontrado (`BadRequestException`) são lançados antes do try e propagam normalmente.

4. **Sem @Public() no endpoint** — O `InternalAuthGuard` é global no projeto e protege todos os endpoints sem `@Public()`. O novo `@Post("nfse")` não recebe `@Public()`, garantindo que apenas chamadas com `x-internal-api-key` válido sejam processadas (mitiga T-30-05).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Todos os métodos implementados têm lógica completa. O endpoint `POST /cobranca/nfse` retorna `{ nfseEmitidaId, numeroNfse, numeroRps, valor }` com dados reais da emissão SOAP e persistência Prisma.

## Threat Flags

Nenhuma nova superfície de ataque não prevista no threat model do plano.

Os mitigations do threat register foram aplicados:
- **T-30-05 (Elevation of Privilege):** `@Post("nfse")` sem `@Public()` — InternalAuthGuard global rejeita requests sem `x-internal-api-key` válido.
- **T-30-06 (Tampering — valor):** `@Min(0.01)` em `EmitirNfseCobrancaDto.valor` impede valor zero ou negativo; class-validator rejeita com 400.
- **T-30-07 (Tampering — idcontasReceber):** `@IsInt({each:true}) @IsPositive({each:true})` impede injeção de valores negativos ou não-inteiros.
- **T-30-08 (Tampering — duplicidade):** `prisma.nfseEmitida.findFirst({ where: { idvenda } })` antes de chamar SOAP — `BadRequestException` 400 se encontrado.

## Self-Check

- [x] `emitir-nfse-cobranca.dto.ts` criado com 5 campos (3 obrigatórios + 2 opcionais)
- [x] `grep "Min(0.01)"` retorna linha 15 com `@Min(0.01)` em campo `valor`
- [x] `grep "ArrayMinSize(1)"` retorna linha 9 com `@ArrayMinSize(1)` em campo `idcontasReceber`
- [x] `grep "NfseModule" cobranca.module.ts` retorna 2 linhas (import + array imports[])
- [x] `grep "emitirNfse" cobranca.service.ts` retorna linha 249 (método)
- [x] `grep "emitirNfse" cobranca.controller.ts` retorna linhas 30-31 (endpoint + chamada)
- [x] `grep "nfseEmitida.findFirst"` retorna linha 270 (verificação de duplicidade)
- [x] `grep "emitirParaContaReceber"` retorna linha 281 (delegação ao NfseService)
- [x] `grep "nfseEmitida.create"` retorna linha 298 (nested write)
- [x] `grep "@Post.*nfse" cobranca.controller.ts` retorna linha 29
- [x] Sem `@Public()` próximo a `nfse` no controller
- [x] `npx tsc --noEmit` retorna 0 erros
- [x] Commits 6858268 e adbe3c4 existem no histórico git

## Self-Check: PASSED
