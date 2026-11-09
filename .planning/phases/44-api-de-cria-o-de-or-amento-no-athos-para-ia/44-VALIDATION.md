---
phase: "44"
slug: "api-de-cria-o-de-or-amento-no-athos-para-ia"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-09"
---

# Phase 44 — Validation Strategy

> Contrato de validação da fase para amostragem de feedback durante a execução.
> Fonte: 44-RESEARCH.md "## Validation Architecture" + planos 44-01..44-04 (IDs locais ORC-01..ORC-10 definidos em 44-01-PLAN.md, ajustados por D-04).
> Segurança: nenhum comando desta tabela conecta ao Athos de produção (192.168.33.198 / 100.102.146.44). O único banco real tocado é o clone `athos-teste` (127.0.0.1:5440, db `athos`), e só com `ATHOS_IT_CLONE=1`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ^30.3.0 + ts-jest ^29.4.9 (`apps/backend/jest.config.js`, `rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`) |
| **Config file** | `apps/backend/jest.config.js` (existente; nada a instalar) |
| **Quick run command** | `npm --prefix apps/backend run test -- athos-orcamento --no-coverage` |
| **Full suite command** | `npm --prefix apps/backend run test -- --no-coverage` (CI roda `npm --workspace @orcamento/backend run test` com `NODE_ENV=test`) |
| **Integração no clone** | `ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos ATHOS_PG_USER=postgres ATHOS_PG_PASS=athosteste ATHOS_ORCAMENTO_ID_FUNCIONARIO=1 ATHOS_ORCAMENTO_ID_VENDEDOR=1 ATHOS_ORCAMENTO_ID_TERMINAL=1 ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO=5 npm --prefix apps/backend run test -- athos-orcamento.clone --no-coverage` |
| **Type check** | `npx tsc --noEmit -p apps/backend/tsconfig.json` |
| **Estimated runtime** | ~10 s (quick), ~15 s (IT no clone), ~90 s (suíte completa) |

Baselines em `d006b37`: suíte `athos` 24 suítes / 423 testes; suíte completa 52 suítes / 701 testes; `tsc` exit 0. Meta ao fim da fase: 773+ testes na suíte completa (IT aparece como skipped sem `ATHOS_IT_CLONE=1`) e 10 testes no IT do clone.

---

## Sampling Rate

- **After every task commit:** `npm --prefix apps/backend run test -- athos-orcamento --no-coverage` (+ o IT do clone nas tasks que o alteram: 44-01-01, 44-03-03, 44-04-02)
- **After every plan wave:** `npm --prefix apps/backend run test -- --no-coverage` e `npx tsc --noEmit -p apps/backend/tsconfig.json`
- **Before `/gsd-verify-work`:** suíte completa verde + IT no clone executado uma vez com `ATHOS_IT_CLONE=1` + checkpoint humano (roteiro de produção) aprovado
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | ORC-02, ORC-03, ORC-05, ORC-08, ORC-10 | T-44-01, T-44-02, T-44-03, T-44-04, T-44-05 | escrita só com `ATHOS_ORCAMENTO_ESCRITA=true`; IT travado em 127.0.0.1:5440/athos; preço lido do Athos; guard global | integration (clone, HTTP real) | comando "Integração no clone" acima | ❌ W0 | ⬜ pending |
| 44-01-02 | 01 | 1 | ORC-04 | T-44-06 | aritmética inteira; linha >= 1.000.000,00 recusada; descontos acima dos limites recusados | unit (TDD, casos-ouro 25378/25483) | `npm --prefix apps/backend run test -- athos-orcamento-calc --no-coverage` | ❌ W0 | ⬜ pending |
| 44-02-01 | 02 | 2 | ORC-05, ORC-06, ORC-08, ORC-10 | T-44-08, T-44-11, T-44-13 | simulação READ ONLY sem INSERT/UPDATE/DELETE; flag estrita; trava de host; erros pg sem vazar texto; SQL compatível com 9.0.5 | unit (pg falso) | `npm --prefix apps/backend run test -- athos-orcamento.service --no-coverage` | ❌ W0 | ⬜ pending |
| 44-02-02 | 02 | 2 | ORC-04, ORC-05 | T-44-09 | limites de desconto de D-04 antes de escrever; invariantes do Balcão nos parâmetros | unit (pg falso) | `npm --prefix apps/backend run test -- athos-orcamento --no-coverage` | ✅ (após 44-02-01) | ⬜ pending |
| 44-02-03 | 02 | 2 | ORC-02, ORC-08 | T-44-11 | deploy sobe com escrita desligada (`ATHOS_ORCAMENTO_ESCRITA:-false`), PIX padrão 5 | static (grep + YAML) | `grep -c "ATHOS_ORCAMENTO_" .env.example deploy/stack.env.example deploy/docker-compose.vps.yml deploy/docker-compose.box.vps.yml` e `python3 -c "import yaml; ..."` | ✅ | ⬜ pending |
| 44-03-01 | 03 | 2 | ORC-09 | T-44-20 | migration aditiva com IF NOT EXISTS, nenhum migrate executado | schema | `npx prisma validate --schema apps/backend/prisma/schema.prisma` e `npm --prefix apps/backend run prisma:generate` | ✅ | ⬜ pending |
| 44-03-02 | 03 | 2 | ORC-09 | T-44-14, T-44-15, T-44-17, T-44-18 | reserva-primeiro; replay; 409 para chave reutilizada/em processamento; auditoria | unit (Prisma falso) | `npm --prefix apps/backend run test -- athos-orcamento-idempotencia --no-coverage` | ❌ W0 | ⬜ pending |
| 44-03-03 | 03 | 2 | ORC-09, ORC-10 | T-44-05, T-44-14 | 401 sem chave interna; 400 para `idformapagamento` (D-04); replay sem duplicata no clone | unit HTTP + integration (clone) | `npm --prefix apps/backend run test -- athos-orcamento.controller --no-coverage` + comando "Integração no clone" | ❌ W0 | ⬜ pending |
| 44-04-01 | 04 | 3 | ORC-01, ORC-07, ORC-10 | T-44-21, T-44-22, T-44-23, T-44-27 | busca 100% parametrizada com escape no valor; sem custo exposto; rota estática antes de `:id` | unit (pg falso) + HTTP | `npm --prefix apps/backend run test -- athos-orcamento.service --no-coverage` e `-- athos-orcamento.controller --no-coverage` | ✅ (estende) | ⬜ pending |
| 44-04-02 | 04 | 3 | ORC-08, ORC-10 | T-44-26 | ciclo completo no clone (invariantes nas 3 tabelas, simulação sem escrita); roteiro só com SELECT | integration (clone) + static | comando "Integração no clone" + `grep -c "^## Passo" .planning/phases/44-api-de-cria-o-de-or-amento-no-athos-para-ia/44-ROTEIRO-VERIFICACAO-MANUAL.md` | ✅ (estende) | ⬜ pending |
| 44-04-03 | 04 | 3 | ORC-08, ORC-10 | T-44-25, T-44-26 | verificação em produção feita só pelo usuário | manual (checkpoint:human-verify) | — (human-check) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Mapa requisito → testes

| Req | Comportamento | Onde é provado |
|-----|---------------|----------------|
| ORC-01 | busca de produtos (tokens, escape, numérico, limite, mapeamento) | 44-04-01 (R1-R5, C9), 44-04-02 (IT7) |
| ORC-02 | pagamento sempre PIX via env, condição 0, valor = valorrecebido = líquido | 44-01-01 (IT1), 44-02-01 (S1, S6), 44-02-03 |
| ORC-03 | transação única com RETURNING nas 3 tabelas | 44-01-01 (IT1), 44-02-01 (S1, S9) |
| ORC-04 | dinheiro em inteiros, rateio maior resto, percentual, descontos | 44-01-02, 44-02-02 (D1-D7), 44-04-02 (IT5) |
| ORC-05 | erros `{codigo, mensagem}` por regra | 44-02-01 (S6-S8), 44-02-02 (D4), 44-03-03 (C7) |
| ORC-06 | simulação READ ONLY | 44-02-01 (S2, S3), 44-02-02 (D7), 44-04-02 (IT6) |
| ORC-07 | leitura do orçamento por id | 44-04-01 (R6, C10), 44-04-02 (IT8, IT9) |
| ORC-08 | flag, trava de host, erros pg, envs, roteiro | 44-01-01 (IT2), 44-02-01 (S4, S5, S9), 44-02-03, 44-04-03 |
| ORC-09 | Idempotency-Key + auditoria | 44-03-02 (I1-I11), 44-03-03 (IT3, IT4) |
| ORC-10 | unit + IT gated + compatibilidade 9.0.5 + roteiro | 44-02-01 (S11), 44-04-01 (R8), IT1-IT10, 44-04-03 |

---

## Wave 0 Requirements

Cada task TDD cria seu arquivo de teste ANTES da implementação (RED primeiro):

- [ ] `apps/backend/src/modules/integrations/athos/athos-orcamento.clone.it.test.ts` — ORC-03, ORC-10 (44-01-01; gated por `ATHOS_IT_CLONE=1`, `describe.skip` no CI)
- [ ] `apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.test.ts` — ORC-04 (44-01-02)
- [ ] `apps/backend/src/modules/integrations/athos/athos-orcamento.service.test.ts` — ORC-02, ORC-05, ORC-06, ORC-08, ORC-10 (44-02-01; `jest.mock("pg")`)
- [ ] `apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.test.ts` — ORC-09 (44-03-02; Prisma falso)
- [ ] `apps/backend/src/modules/integrations/athos/athos-orcamento.controller.test.ts` — ORC-07, ORC-09, contrato HTTP (44-03-03; Nest testing + guard real + ValidationPipe do main.ts)
- [x] Framework: nenhum a instalar (Jest, ts-jest, @nestjs/testing e pg já presentes)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SQL roda no PostgreSQL 9.0.5 real (clone é PG14) | ORC-10 | produção é proibida para agentes; o clone não é 9.0 | 44-ROTEIRO-VERIFICACAO-MANUAL.md Passos 1, 3, 4 e 5 (`SELECT version()`, leituras, simulação e uma criação) |
| GRANTs do usuário de produção (premissa A1) | ORC-08 | só o DBA/usuário acessa o Athos real | Passo 1 (`has_table_privilege` / `has_sequence_privilege`; DBA concede o que faltar) |
| Orçamento aparece no Balcão com statusimpressao falso e em qualquer terminal (premissas A2, A3) | ORC-03 | depende da tela do Balcão.exe | Passo 7 |
| Escolha de funcionário/vendedor/terminal de produção (D-04) | ORC-03, ORC-08 | decisão do usuário, ainda não tomada | Passo 2 |
| Replay sem duplicata em produção | ORC-09 | confirma idempotência contra o Athos real | Passo 8 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (exceto o checkpoint humano 44-04-03, que é `<human-check>`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
