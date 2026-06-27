---
phase: 38
slug: aplica-o-de-defaults-na-cria-o-de-produto
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Authored from 38-CONTEXT.md (research skipped — strategy is direct: Jest unit tests over criarProduto/editarProduto with pg Pool and AthosDefaultsService mocked).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest (existente) |
| **Config file** | `apps/backend/jest.config.js` |
| **Quick run command** | `cd apps/backend && npx jest athos-produto --no-coverage` |
| **Full suite command** | `cd apps/backend && npx jest --no-coverage` |
| **Estimated runtime** | ~15 segundos (subset athos-produto) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend && npx jest athos-produto --no-coverage`
- **After every plan wave:** Run `cd apps/backend && npx jest --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-XX | 01 | 1 | DOPR-01 | — | Criação sem `statusproduto`/`vendeproduto` → INSERT com ambos `true` | unit (service, mock pg) | `npx jest athos-produto --no-coverage` | ⚠ extend | ⬜ pending |
| 38-01-XX | 01 | 1 | DOPR-02 | — | Criação sem estoque → `controlaestoque=true`, `baixarestoque=true`, `estoqueloja=10` | unit | `npx jest athos-produto --no-coverage` | ⚠ extend | ⬜ pending |
| 38-01-XX | 01 | 1 | DFIS-01/02/03 | — | Campos fiscais omitidos preenchidos pela moda (mock `AthosDefaultsService`); fiscal sem moda omitido do INSERT | unit (mock defaults service) | `npx jest athos-produto --no-coverage` | ⚠ extend | ⬜ pending |
| 38-01-XX | 01 | 1 | OVRD-01 | — | Valor enviado pelo operador chega intacto ao INSERT (default não sobrescreve) | unit | `npx jest athos-produto --no-coverage` | ⚠ extend | ⬜ pending |
| 38-01-XX | 01 | 1 | OVRD-02 | — | `editarProduto` NÃO chama `getDefaults()` nem injeta defaults | unit | `npx jest athos-produto --no-coverage` | ⚠ extend | ⬜ pending |
| 38-01-XX | 01 | 1 | OVRD-03 | — | Valor do operador igual ao default ainda é gravado como enviado | unit | `npx jest athos-produto --no-coverage` | ⚠ extend | ⬜ pending |
| 38-01-XX | 01 | 1 | OBSV-01 | — | Log por criação lista campo→valor aplicado; caso "nenhum default necessário" | unit (Logger spy) | `npx jest athos-produto --no-coverage` | ⚠ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finais (38-01-NN) serão atribuídos pelo planner no PLAN.md.*

---

## Wave 0 Requirements

- [ ] Estender `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` — novos casos de criação com defaults (mock de `AthosDefaultsService` injetado), override do operador, edição sem defaults e asserções de log (DOPR/DFIS/OVRD/OBSV)
- [ ] (Se necessário) Teste de validação do `CreateProdutoDto` estendido para os novos campos opcionais
- [ ] Jest + ts-jest já instalados — sem instalação de framework

*A lógica de defaults vive em `criarProduto` (athos-produto.service.ts); os testes estendem a suíte existente desse serviço.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Produto recém-criado nasce ativo/vendável e com estoque sensato, confirmável ao buscá-lo no Athos | DOPR-01/02 | Critério 1 do roadmap exige confirmação contra o banco Athos real (escrita real) | Criar um produto via API sem informar status/estoque, buscar o `idproduto` retornado no Athos e confirmar `statusproduto=true`, `vendeproduto=true`, `controlaestoque=true`, `baixarestoque=true`, `estoqueloja=10` |
| Defaults fiscais por moda refletem o catálogo real | DFIS-01/02/03 | A moda depende do catálogo Athos real (não mockável de forma fiel) | Criar produto sem campos fiscais e confirmar no Athos que os fiscais vieram coerentes com a moda do catálogo |

*Demais comportamentos têm verificação automatizada via Jest.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
