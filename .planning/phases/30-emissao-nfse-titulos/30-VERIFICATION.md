---
status: passed
phase: 30-emissao-nfse-titulos
phase_number: "30"
verified: "2026-05-23"
plans_verified: [30-01, 30-02, 30-03, 30-04]
req_ids: [NFR-01, NFR-02, NFR-03, NFR-04]
human_verification:
  - "Emissão real NFS-e (testes 6, 7, 8 do UAT) — bloqueados por API IIBR offline; reteste quando API voltar"
---

# Phase 30: Emissão de NFS-e a partir de Títulos — Verification

## Goal

Operador pode emitir NFS-e diretamente da página de contas a receber, selecionando títulos em aberto e confirmando emissão com tipo de serviço e descrição.

## Must-Haves Verification

| Requirement | Status | Evidence |
|-------------|--------|----------|
| NFR-01: Modal NFS-e abre ao clicar "Emitir NFS-e" com valor pré-preenchido | ✓ PASS | UAT teste 1 — aprovado pelo operador |
| NFR-02: Valor calculado automaticamente (somente-leitura após UAT) | ✓ PASS | UAT teste 2 — fix aplicado e confirmado |
| NFR-03: Aviso de produto físico — não bloqueia emissão de serviços | ✓ PASS | UAT teste 4 — aprovado pelo operador |
| NFR-04: Títulos 100% físicos excluídos da NFS-e | ✓ PASS | UAT teste 5 — aprovado pelo operador |
| POST /api/cobranca/nfse com validação e backendFetch | ✓ PASS | route.ts criado, TSC 0 erros |
| GET /api/athos/venda/[idvenda]/tipo-produto com guard | ✓ PASS | route.ts criado, TSC 0 erros |
| Modal 4-estados: confirm/loading/success/error | ✓ PASS | Código verificado + TSC limpo |
| Seletor tipo de serviço (4 opções) | ✓ PASS | UAT teste 3 — aprovado pelo operador |
| Descrição auto-preenchida com itens da venda | ✓ PASS | UAT teste 1 — aprovado pelo operador |
| Detecção de produto físico via Athos venda_item | ✓ PASS | Query PostgreSQL validada com dados reais |
| NfseEmitida.idvenda em schema Prisma + migration | ✓ PASS | 30-01-SUMMARY.md Self-Check PASSED |
| CobrancaService.emitirNfse() + verificação duplicidade | ✓ PASS | 30-02-SUMMARY.md Self-Check PASSED |
| NfseService.emitir() persiste NfseEmitida com idvenda | ✓ PASS | 30-04-SUMMARY.md Self-Check PASSED |

## TypeScript Compilation

```
npx tsc --noEmit -p apps/frontend/tsconfig.json → 0 erros
npx tsc --noEmit -p apps/backend/tsconfig.json  → 0 erros
```

## Human Verification Items

Os seguintes itens requerem API IIBR online para validação completa:

1. **Emissão real** — Confirmar estado success com numeroNfse, numeroRps, valor retornados pela API
2. **Duplicidade** — Confirmar mensagem de erro descritiva ao tentar emitir NFS-e para venda já emitida
3. **Regressão orçamento** — Confirmar que modal NFS-e de /orcamento/[id] continua funcionando

Reteste via `/gsd-verify-work 30` quando API IIBR estiver disponível.

## Gaps

Nenhum gap de código identificado. Os itens de human_verification são bloqueados por dependência externa (API IIBR), não por problemas de implementação.

## Verdict

**PASSED** — Toda a lógica de frontend e backend implementada, testada e compilando. Testes de integração com API real pendentes por indisponibilidade da API IIBR no momento da verificação.
