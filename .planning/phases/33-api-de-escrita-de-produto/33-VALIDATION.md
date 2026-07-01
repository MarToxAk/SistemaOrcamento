---
phase: 33
slug: api-de-escrita-de-produto
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-15
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest |
| **Config file** | `apps/backend/jest.config.js` |
| **Quick run command** | `cd apps/backend && npx jest athos-produto.service.test.ts --no-coverage` |
| **Full suite command** | `cd apps/backend && npx jest --no-coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/backend && npx jest athos-produto.service.test.ts --no-coverage`
- **After every plan wave:** Run `cd apps/backend && npx jest --no-coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | CPROD-01 | — | criarProduto aceita DTO válido e retorna `{ idproduto }` | unit | `npx jest athos-produto.service.test.ts -t "criarProduto"` | ❌ W0 | ⬜ pending |
| 33-01-02 | 01 | 1 | CPROD-02 | — | idproduto retornado do INSERT RETURNING, não enviado no payload | unit | `npx jest athos-produto.service.test.ts -t "idproduto gerado"` | ❌ W0 | ⬜ pending |
| 33-01-03 | 01 | 1 | CPROD-03 | — | INSERT não desabilita trigger — nenhuma query DISABLE TRIGGER emitida | unit | `npx jest athos-produto.service.test.ts -t "trigger"` | ❌ W0 | ⬜ pending |
| 33-01-04 | 01 | 1 | CPROD-04 | — | FK inválida retorna 422; descontomaximo inválido retorna 400 | unit | `npx jest athos-produto.service.test.ts -t "validação FK"` | ❌ W0 | ⬜ pending |
| 33-02-01 | 02 | 2 | EPROD-01 | — | editarProduto com valores de preço parciais gera UPDATE correto | unit | `npx jest athos-produto.service.test.ts -t "editarProduto preco"` | ❌ W0 | ⬜ pending |
| 33-02-02 | 02 | 2 | EPROD-02 | — | editarProduto com campos de cadastro parciais gera UPDATE correto | unit | `npx jest athos-produto.service.test.ts -t "editarProduto cadastro"` | ❌ W0 | ⬜ pending |
| 33-02-03 | 02 | 2 | EPROD-03 | — | UPDATE sempre inclui idusuarioalteracao no SET | unit | `npx jest athos-produto.service.test.ts -t "idusuarioalteracao"` | ❌ W0 | ⬜ pending |
| 33-02-04 | 02 | 2 | EPROD-04 | — | Nenhuma query emitida para tabela diferente de produto em edit | unit | `npx jest athos-produto.service.test.ts -t "tabela unica"` | ❌ W0 | ⬜ pending |
| 33-03-01 | 03 | 2 | DPROD-01 | — | alterarStatusProduto(id, false) seta statusproduto=false, vendeproduto=false | unit | `npx jest athos-produto.service.test.ts -t "deactivate"` | ❌ W0 | ⬜ pending |
| 33-03-02 | 03 | 2 | DPROD-02 | — | alterarStatusProduto(id, true) seta statusproduto=true, vendeproduto=true | unit | `npx jest athos-produto.service.test.ts -t "reactivate"` | ❌ W0 | ⬜ pending |
| 33-03-03 | 03 | 2 | DPROD-03 | — | Nenhum método emite DELETE em qualquer condição | unit | `npx jest athos-produto.service.test.ts -t "no delete"` | ❌ W0 | ⬜ pending |
| 33-04-01 | 04 | 3 | SPROD-01 | — | Todas as queries do service têm produto como target único | unit | `npx jest athos-produto.service.test.ts -t "tabela produto"` | ❌ W0 | ⬜ pending |
| 33-04-02 | 04 | 3 | SPROD-03 | — | logger.log chamado após cada operação com operação, idproduto e idusuario | unit | `npx jest athos-produto.service.test.ts -t "logger"` | ❌ W0 | ⬜ pending |
| 33-04-03 | 04 | 3 | SPROD-04 | — | Endpoints aparecem no Swagger com payloads documentados | manual | Abrir /api/docs após start e verificar os três novos endpoints | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/integrations/athos/athos-produto.service.test.ts` — stubs para CPROD-01..04, EPROD-01..04, DPROD-01..03, SPROD-01, SPROD-03

*Nota: O arquivo de teste deve ser criado no Wave 0 antes que os planos de escrita do service sejam executados.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Endpoints aparecem no Swagger com request/response documentados | SPROD-04 | Requer servidor rodando + browser para verificação visual | 1. `cd apps/backend && npm run start:dev` 2. Abrir `/api/docs` 3. Verificar `POST /athos/produtos`, `PATCH /athos/produtos/{id}`, `PATCH /athos/produtos/{id}/status` com schemas completos |
| Permissão de escrita do ATHOS_PG_USER na tabela produto | CPROD-01 | Verificação no banco Athos de produção — fora do scope do Jest | Confirmar com DBA ou executar `\dp produto` no psql do Athos e verificar INSERT/UPDATE para o usuário configurado |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
