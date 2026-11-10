---
phase: 45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail
plan: 04
subsystem: cobranca
tags: [dashboard, alerta-interno, fuso-sao-paulo, contas-receber, pills]
requires:
  - phase: 45-01
    provides: util de vencimento (calcularDiasParaVencer, classificarVencimento) e relacao CobrancaBoleto.avisos
  - phase: 43
    provides: hojeSaoPaulo
provides:
  - buscarBoletosDashboard com situacaoVencimento e ultimoAviso e "hoje" em America/Sao_Paulo
  - painel Boletos a Receber com pills de vencimento, contadores e linha de ultimo aviso
affects: [45-05]
tech-stack:
  added: []
  patterns:
    - "Classificacao de vencimento no backend (mesmo util do job); frontend so mapeia rotulo e cor"
    - "Ultimo aviso por include aninhado (orderBy criadoEm desc, take 1), sem segunda consulta"
key-files:
  created: []
  modified:
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts
    - apps/frontend/src/app/contas-receber/page.tsx
key-decisions:
  - "Campos novos do frontend opcionais para tolerar backend antigo durante o deploy"
  - "Pill de situacao substitui o sufixo cinza de vencimento apenas quando ha situacao; sem situacao o sufixo antigo continua"
duration: 25min
completed: 2026-11-10
status: complete
commits: 2
plan_head_before: f92e61d705244ef30b758c7bcd35704a5d3b04d2
plan_head_after: 1419552
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 45 Plan 04: Alerta interno no painel de boletos Summary

O dashboard de boletos agora classifica cada boleto pendente (vence em 1 a 3 dias, vence hoje, atrasado) com a data de Sao Paulo e informa o ultimo aviso; o painel de /contas-receber mostra isso em pills, contadores no cabecalho e uma linha de ultimo aviso, incluindo "Sem e-mail cadastrado".

## O que foi entregue

- **Task 1 (commit a5462cb):** `buscarBoletosDashboard` usa `hojeSaoPaulo()` e o util de 45-01 (`calcularDiasParaVencer`, `classificarVencimento`), com `situacaoVencimento` e `ultimoAviso` via `include.avisos` (take 1). Sem segunda consulta Prisma; filtro, ordenacao e NFS-e/baixa Athos inalterados. Testes D1..D5 (+ D3b para aviso sem `enviadoEm`) em novo describe com fake timers em 2026-11-11T02:30:00Z (23:30 de SP).
- **Task 2 (commit 1419552):** `getSituacaoVencimentoPill`, `ROTULO_TIPO_AVISO`, `descreverUltimoAviso`, contadores `A vencer: X` e `Atrasados: Y` no cabecalho e linha de ultimo aviso na celula de vencimento. Route handler do frontend intocado.

## Verificacao

- `npm --prefix apps/backend run test -- cobranca.service.dashboard --no-coverage`: 15 passed (9 originais + 6 novos), 1 suite.
- `npm --prefix apps/backend run test -- modules/cobranca --no-coverage`: 12 suites, 166 passed.
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0. `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0.
- `npm --prefix apps/frontend run build`: sucesso (/contas-receber gerado).
- Gates de grep das duas tasks: todos atendidos (toISOString no dashboard: 0; hojeSaoPaulo(): 1; classificarVencimento: 3; cobrancaAvisoVencimento.: 0; getSituacaoVencimentoPill sem paPillVariant e com pa-pill-danger; textos novos presentes).

## Deviations from Plan

### Ambiente

**1. [Rule 3 - Blocking] Worktree em base antiga**
- **Found during:** inicio
- **Issue:** HEAD (f2ea8ed) nao continha f92e61d; arvore limpa.
- **Fix:** `git reset --hard f92e61d705244ef30b758c7bcd35704a5d3b04d2` conforme instrucao do orquestrador.

**2. [Rule 3 - Blocking] node_modules ausente**
- **Fix:** node_modules da raiz do worktree com links por entrada para o checkout principal e copia de `.prisma`, `@prisma` e `prisma`; `prisma generate` rodou so na copia do worktree. `apps/backend` e `apps/frontend` com link para `@types`. Nada disso e versionado (ignorado).

### Menores

- Teste extra D3b (aviso sem `enviadoEm` vira null) alem dos D1..D5; total 15 em vez de 14.
- O ledger de commits (`gsd-plan-head-before`) nao foi gravado em disco (o ambiente recusou o comando composto); `plan_head_before` e a base f92e61d e `commits: 2` foi conferido pelo `git log`.
- `apps/frontend/next-env.d.ts` foi alterado pelo `next build`; revertido com `git checkout -- <arquivo>` e nao commitado.

Fora isso, plano executado como escrito.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. T-45-18 mitigado (mesmo util e fuso do job; teste D1); T-45-20 mitigado (rotulos de mapa fixo, texto escapado pelo React, sem `dangerouslySetInnerHTML`).

## Self-Check: PASSED

- cobranca.service.ts, cobranca.service.dashboard.test.ts e page.tsx existem e foram commitados (a5462cb, 1419552).
