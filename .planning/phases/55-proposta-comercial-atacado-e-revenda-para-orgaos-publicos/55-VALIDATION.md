---
phase: "55"
slug: "proposta-comercial-atacado-e-revenda-para-orgaos-publicos"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-27"
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: Jest 30 com ts-jest (`apps/backend/jest.config.js`, `rootDir: src`, `testRegex: .*\.test\.ts$`). Frontend: sem framework; checagens `node apps/frontend/scripts/checar-*.mjs` (Node >= 22.18) e `tsc --noEmit` |
| **Config file** | `apps/backend/jest.config.js` (frontend: `apps/frontend/tsconfig.json`) |
| **Quick run command** | `npm --prefix apps/backend run test -- src/modules/propostas` |
| **Full suite command** | `npm --prefix apps/backend run test -- --no-coverage` e `npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` |
| **Clone IT (gated, so no athos-teste)** | `ATHOS_IT_CLONE=1 ATHOS_PG_HOST=127.0.0.1 ATHOS_PG_PORT=5440 ATHOS_PG_DB=athos ATHOS_PG_USER=postgres ATHOS_PG_PASS="$ATHOS_CLONE_PASS" ATHOS_ORCAMENTO_ID_FUNCIONARIO=1 ATHOS_ORCAMENTO_ID_VENDEDOR=1 ATHOS_ORCAMENTO_ID_TERMINAL=1 ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO=5 PROPOSTA_ESCRITA_ATIVA=true npm --prefix apps/backend run test -- <arquivo.clone.it.test.ts> --no-coverage` |
| **Chromium smoke (gated)** | `RUN_PUPPETEER_SMOKE=1 npm --prefix apps/backend run test -- src/modules/propostas/propostas-pdf.smoke.test.ts --no-coverage` |
| **Estimated runtime** | ~60 seconds (unitarios); ITs e smoke ~30 s cada |

---

## Sampling Rate

- **After every task commit:** rodar o comando automatizado da propria tarefa (tabela abaixo)
- **After every plan wave:** `npm --prefix apps/backend run test -- --no-coverage` e o typecheck dos dois apps
- **Before `/gsd-verify-work`:** suite completa verde, migrations validadas no Postgres descartavel, ITs de clone e smoke sem ficarem skipped
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Requisitos sinteticos (ROADMAP sem IDs): P55-PRECO (D-01..D-03, D-23, D-24, D-27), P55-MONT (D-04, D-05, D-11..D-13, D-26), P55-CLI (D-14..D-16, D-25), P55-CICLO (D-06, D-08..D-10, D-28), P55-ATHOS (D-07, D-17, D-29, D-30), P55-PDF (D-17..D-22).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | P55-PRECO | T-55-01, T-55-02 | ceil exato em BigInt; entrada estrita | unit | `npm --prefix apps/backend run test -- src/modules/propostas/propostas-calc.util.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 1 | P55-PRECO | T-55-01 | linhas sem desconto; margem e abaixo do custo | unit | `npm --prefix apps/backend run test -- src/modules/propostas/propostas-calc.util.test.ts && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |
| 55-02-01 | 02 | 1 | P55-CICLO, P55-PDF | T-55-03 | schema valido, migrations aditivas | schema | `DATABASE_URL=postgresql://u:p@localhost:5432/x npm exec -w @orcamento/backend -- prisma validate` | ❌ W0 | ⬜ pending |
| 55-02-02 | 02 | 1 | P55-PDF | T-55-04 | script so toca 127.0.0.1 descartavel | script | `bash apps/backend/scripts/validar-migration-descartavel.sh apps/backend/prisma/migrations/20261128120000_add_pdf_template_familia PdfTemplate 9 apps/backend/prisma/migrations/20260622000000_add_pdf_template` | ❌ W0 | ⬜ pending |
| 55-02-03 | 02 | 1 | P55-CICLO | T-55-03 | [BLOCKING] 3 tabelas idempotentes + generate | script | `bash apps/backend/scripts/validar-migration-descartavel.sh apps/backend/prisma/migrations/20261128130000_add_proposta_comercial Proposta 30` (e PropostaItem 18, PropostaConfig 7) | ❌ W0 | ⬜ pending |
| 55-03-01 | 03 | 1 | P55-PRECO, P55-MONT | T-55-06, T-55-07, T-55-08 | leitura READ ONLY; custo com COALESCE por termo | unit + IT clone | `npm --prefix apps/backend run test -- src/modules/integrations/athos/athos-orcamento` e IT `athos-proposta-leitura.clone.it.test.ts` | ❌ W0 | ⬜ pending |
| 55-03-02 | 03 | 1 | P55-CLI | T-55-06 | razao social real; sem fallback inventado | unit | `npm --prefix apps/backend run test -- src/modules/integrations/athos/athos.service.cliente-proposta.test.ts src/modules/integrations/athos/athos.controller.test.ts src/modules/integrations/athos/athos.service.test.ts` | ❌ W0 | ⬜ pending |
| 55-04-01 | 04 | 2 | P55-ATHOS, P55-PRECO | T-55-09, T-55-11 | preco final sem desconto no clone | unit + IT clone | `npm --prefix apps/backend run test -- src/modules/integrations/athos/athos-orcamento-proposta.service.test.ts` e IT `athos-proposta.clone.it.test.ts` | ❌ W0 | ⬜ pending |
| 55-04-02 | 04 | 2 | P55-ATHOS | T-55-09, T-55-10 | flag independente; idempotencia por ref | unit + IT clone | idem 55-04-01 | ❌ W0 | ⬜ pending |
| 55-04-03 | 04 | 2 | P55-ATHOS | T-55-09 | flag desligada por padrao no deploy; Fase 44 intacta | unit (contrato) | `npm --prefix apps/backend run test -- src/modules/propostas/propostas-deploy.env.test.ts src/modules/integrations/athos/athos-orcamento && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |
| 55-05-01 | 05 | 2 | P55-PDF | T-55-15 | ativar PROPOSTA nao desativa ORCAMENTO | unit | `npm --prefix apps/backend run test -- src/modules/pdf-templates/pdf-templates.familia.test.ts src/modules/pdf-templates/pdf-templates.service.test.ts src/modules/quotes/quotes-pdf-storage` | ❌ W0 | ⬜ pending |
| 55-05-02 | 05 | 2 | P55-PDF | T-55-17, T-55-18 | familia validada; preview cruzado recusado | unit | `npm --prefix apps/backend run test -- src/modules/pdf-templates/pdf-templates.controller.test.ts` | ✅ | ⬜ pending |
| 55-05-03 | 05 | 2 | P55-PDF | T-55-16 | seed nao reativa/desativa PROPOSTA | unit | `npm --prefix apps/backend run test -- src/modules/pdf-templates && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |
| 55-06-01 | 06 | 2 | P55-MONT, P55-PRECO | T-55-19, T-55-20 | AdminOnly; preco recalculado no servidor | HTTP | `npm --prefix apps/backend run test -- src/modules/propostas/propostas.http.test.ts` | ❌ W0 | ⬜ pending |
| 55-06-02 | 06 | 2 | P55-MONT, P55-CLI, P55-CICLO | T-55-20, T-55-22, T-55-23 | edicao so em RASCUNHO; snapshot sem reconsultar Athos | unit | `npm --prefix apps/backend run test -- src/modules/propostas` | ❌ W0 | ⬜ pending |
| 55-06-03 | 06 | 2 | P55-CICLO | T-55-19 | modulo montado e registrado | unit + tsc | `npm --prefix apps/backend run test -- src/modules/propostas && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |
| 55-07-01 | 07 | 3 | P55-PDF | T-55-25, T-55-26 | sem custo/margem no HTML; escape de HTML | unit (HTML) | `npm --prefix apps/backend run test -- src/modules/propostas/propostas-pdf.test.ts` | ❌ W0 | ⬜ pending |
| 55-07-02 | 07 | 3 | P55-PDF | T-55-27, T-55-28, T-55-29, T-55-54 | rede bloqueada; multipagina sem escala; prefixo propostas/; PDF oficial so por snapshot (nao le configuracao) | unit + smoke Chromium | `npm --prefix apps/backend run test -- src/modules/propostas/propostas-pdf.service.test.ts src/modules/quotes/quotes-pdf-storage && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` e smoke `propostas-pdf.smoke.test.ts` | ❌ W0 | ⬜ pending |
| 55-08-01 | 08 | 4 | P55-ATHOS, P55-CICLO | T-55-31, T-55-33, T-55-34, T-55-55 | gerar ponta a ponta no clone; compare-and-set; pdfSnapshot gravado | IT clone | IT `src/modules/propostas/propostas.clone.it.test.ts` | ❌ W0 | ⬜ pending |
| 55-08-02 | 08 | 4 | P55-ATHOS, P55-CICLO | T-55-31, T-55-32, T-55-33, T-55-34, T-55-36, T-55-38, T-55-55 | snapshot capturado antes da reserva; concorrencia, orfao e falha de PDF; rotas gerar e recuperar protegidas | unit + HTTP | `npm --prefix apps/backend run test -- src/modules/propostas/propostas.lancamento.test.ts src/modules/propostas/propostas.service.test.ts src/modules/propostas/propostas.http.test.ts && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |
| 55-09-01 | 09 | 3 | P55-MONT, P55-CICLO | T-55-39, T-55-40, T-55-41 | proxy com lista permitida (so rotas do plano 55-06) e sessao admin | script + tsc | `node apps/frontend/scripts/checar-propostas-rotas.mjs && npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 55-10-01 | 10 | 6 | P55-CLI, P55-CICLO | T-55-47 | paineis desabilitados fora de RASCUNHO | script + tsc | `node apps/frontend/scripts/checar-propostas-formatadores.mjs && npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 55-10-02 | 10 | 6 | P55-ATHOS, P55-CICLO | T-55-43, T-55-44, T-55-45, T-55-59 | confirmacao explicita; botao travado; aviso de cancelamento local; rotas de ciclo de vida liberadas no proxy | script + tsc | `node apps/frontend/scripts/checar-propostas-formatadores.mjs && node apps/frontend/scripts/checar-propostas-rotas.mjs && npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 55-11-01 | 11 | 8 | todos | T-55-48, T-55-49 | regressao completa e roteiro | regressao | `npm --prefix apps/backend run test -- --no-coverage` (mais typecheck, migrations, smoke e ITs de clone) | ✅ | ⬜ pending |
| 55-11-02 | 11 | 8 | P55-ATHOS | T-55-48, T-55-49, T-55-50 | deploy com escrita desligada | manual (human-action) | manual: ver Manual-Only | n/a | ⬜ pending |
| 55-11-03 | 11 | 8 | P55-MONT, P55-PDF, P55-CLI | T-55-49 | gerar responde desabilitado sem prender a proposta | manual (human-verify) | manual: ver Manual-Only | n/a | ⬜ pending |
| 55-12-01 | 12 | 9 | P55-ATHOS | T-55-51 | decisao one-way de ligar a flag | manual (decision) | manual: ver Manual-Only | n/a | ⬜ pending |
| 55-12-02 | 12 | 9 | P55-ATHOS, P55-PDF | T-55-52, T-55-53 | numero do PDF = numero do Balcao | manual (human-verify) | manual: ver Manual-Only | n/a | ⬜ pending |
| 55-13-01 | 13 | 5 | P55-CICLO, P55-PDF | T-55-35, T-55-54 | PDF armazenado servido sem regenerar; regenerado so do pdfSnapshot gravado; previa sem armazenar e sem custo | unit + HTTP | `npm --prefix apps/backend run test -- src/modules/propostas/propostas.ciclo.test.ts src/modules/propostas/propostas.http.test.ts && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |
| 55-13-02 | 13 | 5 | P55-CICLO | T-55-37, T-55-56 | duplicar sem Athos e sem copiar snapshot; aviso de cancelamento local | unit + HTTP | `npm --prefix apps/backend run test -- src/modules/propostas/propostas.ciclo.test.ts src/modules/propostas/propostas.http.test.ts src/modules/propostas/propostas.service.test.ts && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ❌ W0 | ⬜ pending |
| 55-13-03 | 13 | 5 | P55-PDF | T-55-56, T-55-57 | preview de template: familia errada e source perigoso recusados; regressao Fase 44, templates e storage | HTTP + regressao | `npm --prefix apps/backend run test -- src/modules/propostas src/modules/integrations/athos/athos-orcamento src/modules/pdf-templates src/modules/quotes/quotes-pdf-storage && npm exec -w @orcamento/backend -- tsc -p tsconfig.json --noEmit` | ✅ (estende) | ⬜ pending |
| 55-14-01 | 14 | 4 | P55-MONT | T-55-58 | busca de produto sem HTML bruto; formatadores puros | script + tsc | `node apps/frontend/scripts/checar-propostas-formatadores.mjs && node apps/frontend/scripts/checar-propostas-rotas.mjs && npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 55-14-02 | 14 | 4 | P55-MONT, P55-CICLO | T-55-42, T-55-58 | sem calculo de preco no navegador; sem HTML bruto; desabilitado fora de RASCUNHO | script + tsc | `node apps/frontend/scripts/checar-propostas-formatadores.mjs && node apps/frontend/scripts/checar-propostas-rotas.mjs && npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 55-15-01 | 15 | 7 | P55-PDF | T-55-46 | abas por familia; parametro familia restrito a ORCAMENTO e PROPOSTA | tsc | `npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 55-15-02 | 15 | 7 | P55-PDF | T-55-46, T-55-60 | previa por familia; unica rota de preview de template liberada no proxy | script + tsc | `node apps/frontend/scripts/checar-propostas-rotas.mjs && npm exec -w @orcamento/frontend -- tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Framework de testes: Jest 30 ja instalado e verde (Fase 44: 95 testes; STATE registra suite completa verde). Frontend: checagens `.mjs` ja existem como padrao.
- [x] Os testes novos sao criados em TDD dentro das proprias tarefas (marcados ❌ W0 acima = arquivo ainda nao existe), sem necessidade de instalar nada.
- [x] Clone `athos-teste` em `127.0.0.1:5440` disponivel (container ativo); senha so por variavel de ambiente (`ATHOS_CLONE_PASS`), nunca em arquivo versionado.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy em producao com `PROPOSTA_ESCRITA_ATIVA` desligada, migrations aplicadas e variaveis ATHOS_ORCAMENTO_* e GRANTs conferidos | P55-ATHOS | Acao em ambiente de producao; migrations so por deploy humano | `55-ROTEIRO-ATIVACAO.md`, plano 55-11 tarefa 2 |
| Verificacao visual das telas, da previa do PDF (institucional, sem custo, com marca d'agua) e de que gerar responde "desabilitado" sem gravar | P55-MONT, P55-PDF, P55-CLI | Frontend sem framework de teste visual; layout de documento | Plano 55-11 tarefa 3 |
| Decisao de ligar a escrita de propostas no Athos de producao (one-way) | P55-ATHOS | Escrita real em producao sem cancelamento no sistema (D-07, D-10) | Plano 55-12 tarefa 1 |
| Primeiro lancamento real conferido no Balcao e no PDF oficial | P55-ATHOS, P55-PDF | Depende do Athos de producao e do Balcao | Plano 55-12 tarefa 2 |

*Excecao de continuidade: as quatro tarefas manuais finais (55-11-02, 55-11-03, 55-12-01, 55-12-02) sao inerentes ao rollout one-way e vem depois de toda a verificacao automatizada.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (excecao: checkpoints humanos do rollout, listados em Manual-Only)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (excecao documentada: 4 checkpoints humanos finais)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
