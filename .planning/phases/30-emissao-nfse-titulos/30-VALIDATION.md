---
phase: 30
slug: emissao-nfse-titulos
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (NestJS default) |
| **Config file** | apps/backend/jest.config.ts |
| **Quick run command** | `cd apps/backend && npx jest --testPathPattern "(nfse|cobranca)" --passWithNoTests` |
| **Full suite command** | `cd apps/backend && npx jest` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend && npx jest --testPathPattern "(nfse|cobranca)" --passWithNoTests`
- **After every plan wave:** Run `cd apps/backend && npx jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | NFR-02 | — | Valor enviado ao backend é o confirmado pelo operador | unit | `npx jest cobranca.service` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | NFR-03 | — | emitirParaContaReceber() chama SOAP corretamente | unit (mock SOAP) | `npx jest nfse.service` | Parcial | ⬜ pending |
| 30-01-03 | 01 | 1 | NFR-04 | — | NfseEmitida criada com campos corretos após emissão | unit | `npx jest cobranca.service` | ❌ W0 | ⬜ pending |
| 30-01-04 | 01 | 1 | NFR-01 | — | Modal abre pré-preenchido com dados do cliente | manual (UI) | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/cobranca/cobranca.service.nfse.spec.ts` — stubs para NFR-02 e NFR-04
- [ ] `apps/backend/src/modules/integrations/nfse/nfse.service.test.ts` — adicionar test stub para `emitirParaContaReceber()`

*Wave 0 cobre todos os gaps de automação antes de iniciar implementação.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modal abre pré-preenchido com soma dos títulos e dados do cliente | NFR-01 | UI interaction — requer browser | 1. Selecionar títulos em /contas-receber/[idcliente] → clicar "Emitir NFS-e" → verificar campo valor = soma e nome do cliente exibido |
| Aviso de produto físico exibido quando títulos contêm produtos físicos | D-02/D-03 | UI interaction | 2. Selecionar título com `tipoproduto=true` → verificar alert amarelo no modal |
| Aviso de duplicidade quando idvenda já tem NFS-e | D-08 | UI interaction | 3. Tentar emitir NFS-e para venda que já tem registro em NfseEmitida → verificar aviso no modal |
| Modal 3 etapas: Confirmação → Loading → Sucesso | D-14 | UI state transitions | 4. Confirmar emissão → verificar estado Loading → verificar estado Sucesso com numeroNfse |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
