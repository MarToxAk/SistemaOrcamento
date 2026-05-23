---
phase: 30-emissao-nfse-titulos
plan: "04"
subsystem: backend+frontend
tags: [nfse, prisma, deduplication, orcamento, cross-flow]
dependency_graph:
  requires:
    - 30-01 (NfseEmitida.idvenda schema + migration)
  provides:
    - NfseService.emitir() persists NfseEmitida with idvenda
    - Cross-flow NFS-e duplicate warning via error state
  affects:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
tech_stack:
  added: []
  patterns:
    - Try/catch isolado para persistencia pos-SOAP
    - findFirst antes de create para deduplicacao T-30-13
    - Propagacao de data.message da API para error state D-18
key_files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
decisions:
  - Task 2 sem alteracoes - D-18 ja implementado pelo fluxo de erro existente
  - Try/catch separado garante que falha nao cancela NFS-e emitida no SOAP
  - saleExternalId null resulta em idvenda null conforme D-10
metrics:
  duration: ~15min
  completed: 2026-05-23
  tasks: 2
  files: 1
---

# Phase 30 Plan 04: Vinculacao NFS-e Orcamento a NfseEmitida Summary

**One-liner:** NfseService.emitir() persiste NfseEmitida com idvenda pos-SOAP via try/catch isolado (T-30-13), e modal NFS-e de /orcamento/[id] ja propaga data.message da API para aviso cross-flow (D-18 confirmado sem codigo novo).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | NfseService.emitir() salvar NfseEmitida com idvenda apos emissao | 5bfb8cb | nfse.service.ts |
| 2 | /orcamento/[id] aviso informativo D-18 | no-op comportamento ja existente | nenhum |

## Decisions Made

1. **Try/catch separado para NfseEmitida.create()** - Se a criacao falhar, o erro e logado mas nao relancado. A NFS-e ja foi emitida com sucesso no SOAP; persistencia e melhor-esforco.

2. **findFirst antes de create (T-30-13)** - Verifica idvenda existente antes de criar. Se encontrado, logger.warn e skip.

3. **idvenda null quando saleExternalId ausente** - Conforme D-10, orcamentos sem saleExternalId criam NfseEmitida com idvenda null.

4. **Task 2 no-op - D-18 ja satisfeito** - handleEmitirNfse() extrai data?.message || data?.error quando !res.ok (linha 439), exibe em alert-danger (linhas 685-690). Mensagem do backend aparece automaticamente.

## Deviations from Plan

Task 2 confirmada como no-op. O fluxo de erro existente ja satisfaz D-18. Conforme instrucao do plano: Se sim, esta task confirma o comportamento correto e documenta no SUMMARY.

## Pre-existing Test Failures (Out of Scope)

4 testes em nfse.discount.test.ts (NFSD-04) falhavam por timeout pre-existente (5s jest vs 15s axios em getInfoNfse()). Deferred para correcao futura.

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma nova superficie. Mitigations T-30-13, T-30-14, T-30-15 aplicados.

## Self-Check

- [x] nfse.service.ts modificado com NfseEmitida.create() em try/catch separado
- [x] Commit 5bfb8cb existe
- [x] nfseEmitida.create presente nas linhas 724 e 737
- [x] saleExternalId usado na linha 718
- [x] Backend TSC: 0 erros
- [x] Frontend TSC: 0 erros
- [x] Modal NFS-e exibe data.message via error state (linhas 439, 447, 685-690 do page.tsx)
- [x] Nenhuma chamada SOAP adicionada no frontend

## Self-Check: PASSED
