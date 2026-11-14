---
phase: 48-contas-a-receber-escolher-a-ordena-o-data-nome-pago
plan: 04
subsystem: frontend
tags: [contas-receber, ordenacao, notas-fiscais, url-state, next]
requires:
  - phase: 48-01
    provides: "_shared/ordenacao.ts (CONFIG_NOTAS, CONFIG_NOTAS_CLIENTE, ordenarNotas), seletor-ordenacao.tsx"
  - phase: 47
    provides: useFiltrosUrl, NotasFiscais, pagina /contas-receber/notas
provides:
  - "NotasFiscais com props ordenacao/onMudarOrdenacao, ordenarNotas antes da paginacao de 50"
  - "/contas-receber/notas ordenavel por emissao e nome via ?ordem=&dir="
  - "aba Notas Fiscais do cliente ordenavel por emissao via ?ordem=&dir="
affects: [48-05]
tech-stack:
  added: []
  patterns:
    - "Componente aceita ordem controlada (URL) ou interna (sem onMudarOrdenacao), como ja fazia com a pagina"
    - "Ordenar a lista filtrada completa antes de paginar"
key-files:
  created: []
  modified:
    - apps/frontend/src/app/contas-receber/_componentes/notas-fiscais.tsx
    - apps/frontend/src/app/contas-receber/notas/page.tsx
    - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-notas.tsx"
key-decisions:
  - "Config interna = mostrarCliente ? CONFIG_NOTAS : CONFIG_NOTAS_CLIENTE; ordem fora de config.permitidas (ex.: nome na aba do cliente) cai em config.padrao dentro do componente, alem do lerOrdenacao"
  - "Mudar a ordem volta para a pagina 1: com pagina na URL, a pagina que trata onMudarOrdenacao grava pagina: null; sem onMudarPagina (aba do cliente), o componente zera paginaInterna"
  - "useMemo de filtradas depende de ordem e dir (primitivos) em vez do objeto, sem precisar de eslint-disable"
requirements-completed: [ORD-01, ORD-02, ORD-04, ORD-06]
duration: ~20min
completed: 2026-11-14
status: complete
commits: 2
plan_head_before: 57c0f20
plan_head_after: d2002aa95d90deeb087b8cf045357e85346560cb
actuals:
  tokens: 2100
  tasks: 2
  commits: 2
---

# Fase 48 Plano 04: Notas fiscais ordenaveis Summary

**As notas fiscais (NFS-e e NF-e) passam a ordenar por data de emissao e nome do cliente em /contas-receber/notas, e por data de emissao na aba Notas do cliente, com a escolha na URL e a ordenacao aplicada antes da paginacao de 50.**

## Tarefas

1. **Tarefa 1 (tracer): notas ordenaveis de ponta a ponta em /contas-receber/notas** - commit `08486f4`.
   - `notas-fiscais.tsx`: props `ordenacao` e `onMudarOrdenacao`; `config` interna; `ordenacaoInterna` quando a ordem nao vem de fora; `filtradas = ordenarNotas(filtrarNotasExibicao(...), {ordem, dir})` no mesmo `useMemo`, antes de `paginar`; `mudarOrdenacao` (zera `paginaInterna` sem `onMudarPagina`); `SeletorOrdenacao` na barra do topo ao lado do botao Atualizar; cabecalhos Emissao e Cliente (so com `mostrarCliente`) viraram `ThOrdenavel` nas duas tabelas.
   - `notas/page.tsx`: `lerOrdenacao(obter("ordem"), obter("dir"), CONFIG_NOTAS)`; `onMudarOrdenacao` grava `ordenacaoParaUrl(nova, CONFIG_NOTAS)` com `pagina: null`. "Limpar Filtros" nao mexeu (a ordem fica).
2. **Tarefa 2: aba Notas do cliente** - commit `d2002aa`. `aba-notas.tsx` usa `useFiltrosUrl` e `CONFIG_NOTAS_CLIENTE`; passa `ordenacao` e `onMudarOrdenacao` ao `NotasFiscais` (mostra so "Data de Emissao" + botao de direcao, sem cabecalho Cliente). Remover Anexo, guarda de id invalido e secao Notas Fiscais Athos intactos.

Portao do tracer: o `<verify>` da Tarefa 1 (checar-ordenacao, checar-notas, tsc, build) foi reexecutado de ponta a ponta antes do commit e passou, antes de expandir para a Tarefa 2.

## Resultados reais da verificacao

- `node apps/frontend/scripts/checar-ordenacao.mjs`: exit 0, 21 linhas `OK`.
- `node apps/frontend/scripts/checar-notas.mjs`: exit 0.
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 (apos cada tarefa).
- `npm --prefix apps/frontend run build`: exit 0 (apos cada tarefa); `apps/frontend/next-env.d.ts` restaurado com `git checkout --` (sem diferenca no status).
- Node v22.22.1.
- Greps de aceitacao: `ordenarNotas(` = 1; `ThOrdenavel` = 5 (import + 4 cabecalhos); `SeletorOrdenacao` = 2; `onMudarOrdenacao` em `notas/page.tsx` = 1; `CONFIG_NOTAS` em `notas/page.tsx` = 3; `LIMITE_NOTAS_ZIP` = 3 e `/api/cobranca/notas/zip` = 3 (baseline preservado); `useFiltrosUrl` em `aba-notas.tsx` = 2; `CONFIG_NOTAS_CLIENTE` = 3; "Isso NÃO cancela a nota na prefeitura" = 1 (baseline).
- `git diff --stat 57c0f20 HEAD` lista so os 3 arquivos do plano: nenhum arquivo em `apps/frontend/src/app/api`, `apps/backend` nem `[idcliente]/page.tsx`.

## Deviations from Plan

Nenhuma de regra 1-4; plano executado como escrito. Observacoes:

- Worktree reposicionado com `git reset --hard 57c0f20` (HEAD do checkout principal, inclui 48-01 e 48-02), conforme instrucao do orquestrador.
- Sem `node_modules` no worktree: symlinks para os do repo principal (`node_modules` e `apps/frontend/node_modules`); aparecem como `??` e nao foram commitados.
- Regras da fase respeitadas: nenhuma chamada nova ao backend (a consulta `GET /api/cobranca/notas` nao recebeu `ordem`/`dir`); `buscarNotasFiscaisCliente`/`n.valornota` nao foram tocados; nada de escrita no Athos; downloads, selecao, ZIP (limite 50), Remover Anexo e secao Notas Fiscais Athos iguais (D-03 da fase 47).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. T-48-08 mitigado: `lerOrdenacao` com `CONFIG_NOTAS`/`CONFIG_NOTAS_CLIENTE` (valor fora da lista vira padrao) e o componente ainda cai em `config.padrao` se a ordem nao estiver em `permitidas`; nada da URL vai para o backend. T-48-09 mitigado: guarda de id invalido da aba intacta; a ordenacao so reordena o que ja veio filtrado por `idclienteAthos`.

## Verificacao humana pendente (pos-fase)

Nao foi possivel validar visualmente (sem navegador). Conferir: em /contas-receber/notas ordenar por Nome com mais de uma pagina, ir para a pagina 2 (continua na ordem) e voltar para Data; na aba Notas de um cliente inverter a direcao e dar F5 (`?aba=notas&ordem=data&dir=asc`); baixar um PDF e um ZIP para confirmar que nada mudou.

## Self-Check: PASSED

- Arquivos modificados existem: `notas-fiscais.tsx`, `notas/page.tsx`, `aba-notas.tsx`.
- Commits `08486f4` e `d2002aa` presentes no historico do worktree.
