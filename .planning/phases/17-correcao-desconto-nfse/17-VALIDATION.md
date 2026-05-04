---
phase: 17
slug: correcao-desconto-nfse
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
---

# Phase 17 — Validation Strategy

> Per-phase validation contract. Esta fase corrige bugs de path e coercao de tipos em um
> componente React/TSX. Nao existe suite de testes automatizados para o frontend deste projeto.
> Toda validacao e manual via checkpoint:human-verify (Task 3 do plano).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — componente React sem testes automatizados existentes |
| **Config file** | none |
| **Quick run command** | `grep -c "quote?.body?.totais?.valor" apps/frontend/src/app/orcamento/[id]/page.tsx` (structural) |
| **Full suite command** | Verificacao manual via browser (ver Task 3 do 17-01-PLAN.md) |
| **Estimated runtime** | ~5 minutos (verificacao manual) |

---

## Sampling Rate

- **Apos Task 1:** Rodar grep estrutural (zero ocorrencias do path errado)
- **Apos Task 2:** Rodar grep de tipo correto (Record<string, string | number | boolean>)
- **Antes de fechar a fase:** Checkpoint manual completo (Task 3)
- **Max feedback latency:** < 5 minutos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 17-01-T1 | 01 | 1 | NFSC-01,02,03,04 | T-17-02 | Campo valor total nunca usa path undefined | structural grep | `grep -c "quote?.totais" page.tsx` = 0 | ⬜ pending |
| 17-01-T2 | 01 | 1 | NFSC-05 | T-17-01 | Desconto enviado como boolean/number, nao string | structural grep | `grep -c '"true"' page.tsx` = 0 | ⬜ pending |
| 17-01-T3 | 01 | 1 | NFSC-01..05 | T-17-01,02 | Desconto calculado e aplicado corretamente no SOAP | manual | Ver instrucoes Task 3 checkpoint | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nenhum. A infraestrutura de grep estrutural nao requer instalacao. A verificacao manual requer
apenas o servidor de desenvolvimento do frontend em execucao.

*Existing infrastructure (grep + browser) covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Campo "Valor total" exibe total real do orcamento ao ativar switch | NFSC-01 | Sem testes E2E automatizados para o modal NFS-e | Abrir modal, ativar switch, verificar campo != 0.00 |
| Calculo bidirecional % ↔ R$ ↔ valor total | NFSC-02, NFSC-03 | Logica de sincronizacao depende de interacao DOM | Digitar valores em cada campo e verificar atualizacao cruzada |
| Clamping de valor total acima do total do orcamento | NFSC-04 | Sem testes de input DOM | Digitar valor > total, verificar clamp automatico |
| Backend aplica desconto correto no SOAP | NFSC-05 | Depende de POST real ao backend + logs | Emitir NFS-e com desconto e verificar logs do backend |

---

## Validation Sign-Off

- [x] Todas as tasks tem verify estrutural (grep) ou checkpoint humano como gate bloqueante
- [x] Task 3 e checkpoint:human-verify com gate="blocking" — valida todos os 5 requisitos
- [x] Wave 0 nao necessario (sem infraestrutura nova a instalar)
- [x] Sem comandos watch-mode nos steps de verificacao
- [x] Feedback latency < 5 minutos (grep imediato + verificacao manual estruturada)
- [x] `nyquist_compliant: true` definido no frontmatter

**Approval:** pending — aguardando execucao da phase
