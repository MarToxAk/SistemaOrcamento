---
phase: 48-contas-a-receber-escolher-a-ordena-o-data-nome-pago
plan: 01
subsystem: frontend
tags: [contas-receber, ordenacao, boletos, url-state, next]
requires:
  - phase: 47
    provides: useFiltrosUrl, filtrarBoletos, boletos-consolidados, padrao checar-*.mjs
provides:
  - "_shared/ordenacao.ts: funcoes puras e configs de ordenacao (boletos, notas, clientes)"
  - "seletor-ordenacao.tsx: SeletorOrdenacao e ThOrdenavel"
  - "/contas-receber/boletos ordenavel por data, nome e pago via ?ordem=&dir="
affects: [48-03, 48-04, 48-05]
tech-stack:
  added: []
  patterns:
    - "Modulo puro sem imports (carregavel pelo Node via type stripping) + config por lista"
    - "Ordem na URL com padrao sem parametros (router.replace via useFiltrosUrl)"
key-files:
  created:
    - apps/frontend/src/app/contas-receber/_shared/ordenacao.ts
    - apps/frontend/src/app/contas-receber/_componentes/seletor-ordenacao.tsx
    - apps/frontend/scripts/checar-ordenacao.mjs
  modified:
    - apps/frontend/src/app/contas-receber/_componentes/boletos-consolidados.tsx
key-decisions:
  - "Ordenacao inteira no navegador sobre a lista completa ja carregada, filtrando antes de ordenar (D-08); nenhuma chamada nova ao backend"
  - "Em Pago, pendentes ficam sempre por vencimento crescente e nulos sempre por ultimo, nas duas direcoes (D-04)"
  - "BoletoDashboardItem.dataPagamento opcional: sem ele (backend 48-02 ainda nao aplicado) pagos ficam sem data e vao para o fim do grupo"
requirements-completed: [ORD-01, ORD-02, ORD-03, ORD-06]
duration: ~35min
completed: 2026-11-14
status: complete
commits: 3
plan_head_before: cce6fdf6a61d2de4aec6f3faac3cef936771c145
plan_head_after: 02848f3b3d29b1529f50a06580cf11cc527e0d8c
actuals:
  tokens: 6600
  tasks: 2
  commits: 3
---

# Fase 48 Plano 01: Base de ordenacao e boletos ordenaveis Summary

**Funcoes puras de ordenacao (boletos, notas, clientes) com a ordem na URL (`?ordem=&dir=`), mais seletor "Ordenar Por", botao de direcao e cabecalhos clicaveis na lista de boletos consolidados.**

## Tarefas

1. **Tarefa 1 (tracer): boletos ordenaveis de ponta a ponta** - commit `cde6494`. `ordenacao.ts` (tipos, `CONFIG_BOLETOS`, `CONFIG_BOLETOS_CLIENTE`, `lerOrdenacao`, `ordenacaoParaUrl`, `proximaOrdenacao`, `compararTexto`, `ordenarBoletos`), `seletor-ordenacao.tsx` (select + botao de direcao com seta, `ThOrdenavel` com `aria-sort`), `boletos-consolidados.tsx` (`ordenarBoletos(filtrarBoletos(boletos, filtros), ordenacao)`, seletor na linha "Mostrando X de Y", cabecalhos Cliente/Vencimento/Status clicaveis, campo opcional `dataPagamento`) e `checar-ordenacao.mjs` (11 casos).
2. **Tarefa 2 (TDD): notas e clientes**
   - RED `b01f77a`: 10 casos novos falhando (`o.ordenarNotas is not a function`).
   - GREEN `02848f3`: `CONFIG_NOTAS`, `CONFIG_NOTAS_CLIENTE`, `CONFIG_CLIENTES`, `ordenarNotas`, `ordenarClientes`. Script com 21 casos `OK`.

Portao do tracer: o `<verify>` (script, tsc, build) foi reexecutado de ponta a ponta apos o commit da Tarefa 1 e passou antes de expandir para a Tarefa 2.

## Resultados reais da verificacao

- `node apps/frontend/scripts/checar-ordenacao.mjs`: exit 0, 21 linhas `OK` (criterio: >= 15; tarefa 1 sozinha: 11, criterio >= 8).
- `checar-filtros-boletos.mjs`, `checar-filtros-url.mjs` e `checar-notas.mjs`: exit 0.
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0.
- `npm --prefix apps/frontend run build`: exit 0 (rodado apos cada tarefa); `next-env.d.ts` restaurado com `git checkout --`, sem diferenca no status.
- Greps de aceitacao: imports em `ordenacao.ts` = 0; `ordenarBoletos(filtrarBoletos(boletos, filtros), ordenacao)` = 1; `SeletorOrdenacao` = 2 (import + uso); `ThOrdenavel` = 4 (import + 3 cabecalhos); `lerOrdenacao` presente; `aria-sort` = 2; `ESTORNAR para confirmar` = 1; `estornar-baixa-athos` = 1 (baselines preservados, D-03 da fase 47); `ordenarNotas|ordenarClientes` exportadas = 2; configs exportadas = 5.
- Node v22.22.1. O script emite o aviso `MODULE_TYPELESS_PACKAGE_JSON` do Node (ja ocorre no padrao dos scripts existentes; o `package.json` do frontend nao e alterado).

## Deviations from Plan

Nenhuma de regra 1-4; plano executado como escrito. Observacoes de ambiente:

- O worktree nao tinha `node_modules`: criei symlinks para `/root/SistemaOrcamento/node_modules` e `/root/SistemaOrcamento/apps/frontend/node_modules`. Como o `.gitignore` usa `node_modules/` (nao casa symlink), eles aparecem como `??` no status; foram deixados fora dos commits (staging por arquivo) e nao devem ser commitados.
- Worktree reposicionado com `git reset --hard cce6fdf` (HEAD do checkout principal, que inclui planos 48 e fase 47), conforme instrucao.

## Known Stubs

Nenhum. `dataPagamento` e campo opcional intencional: o backend o preenche no plano 48-02 (em paralelo); enquanto isso pagos ficam sem data e vao para o fim do grupo, sem erro.

## Threat Flags

Nenhum. T-48-01 mitigado: `lerOrdenacao` so aceita valores de `permitidas` e asc/desc, com casos no script; nada da URL e renderizado como HTML. T-48-02 mitigado: so `visiveis`, a contagem, o thead e o `<style>` local mudaram em `boletos-consolidados.tsx`; baselines de estorno confirmados.

## Verificacao humana pendente (pos-fase)

Abrir `/contas-receber/boletos`, trocar "Ordenar Por" e a direcao, clicar em Cliente/Vencimento/Status, dar F5 e colar o link em outra aba. Nao foi possivel validar visualmente aqui (sem navegador); validado por tsc, build e casos executaveis.

## Self-Check: PASSED

- Arquivos: `ordenacao.ts`, `seletor-ordenacao.tsx`, `checar-ordenacao.mjs`, `boletos-consolidados.tsx` existem.
- Commits `cde6494`, `b01f77a`, `02848f3` presentes no historico do worktree.
