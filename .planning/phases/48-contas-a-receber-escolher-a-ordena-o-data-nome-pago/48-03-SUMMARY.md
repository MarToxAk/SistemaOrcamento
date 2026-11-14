---
phase: 48-contas-a-receber-escolher-a-ordena-o-data-nome-pago
plan: 03
subsystem: frontend
tags: [contas-receber, ordenacao, clientes, url-state, next]
requires:
  - phase: 48-01
    provides: "ordenacao.ts (CONFIG_CLIENTES, lerOrdenacao, ordenacaoParaUrl, ordenarClientes), SeletorOrdenacao e ThOrdenavel"
  - phase: 48-02
    provides: "total_pago por cliente em GET athos/contas-receber/dashboard"
provides:
  - "/contas-receber com ordem dos clientes na URL (?ordem=atrasado|devido|nome|pago&dir=asc|desc)"
  - "Coluna e criterio Pago (total historico pago) na tabela de clientes"
affects: [48-04, 48-05]
tech-stack:
  added: []
  patterns:
    - "Ordem na URL via useFiltrosUrl junto com status e busca; padrao sem parametros"
key-files:
  created: []
  modified:
    - apps/frontend/src/app/contas-receber/page.tsx
key-decisions:
  - "Pago de clientes = total historico pago (total_pago do backend), conforme decisao do usuario; padrao segue total atrasado decrescente"
  - "Valor numerico (inclusive 0) aparece formatado em BRL; null/undefined aparece como traco e vai para o fim na ordenacao"
requirements-completed: [ORD-01, ORD-02, ORD-05, ORD-06]
duration: ~15min
completed: 2026-11-14
status: complete
commits: 2
plan_head_before: 57c0f201f0a763e902fd1b30016ff116fc8cc251
plan_head_after: a6705eefaca818e86984069ee33b93bd761230ac
actuals:
  tokens: 1800
  tasks: 2
  commits: 2
---

# Fase 48 Plano 03: Clientes com ordem na URL e coluna Pago Summary

**A tabela de clientes de /contas-receber passou a guardar a ordem na URL (`?ordem=&dir=`, junto com `status` e `busca`), com seletor "Ordenar Por", cabecalhos clicaveis (Cliente, Total devido, Atrasado, Pago) e a nova coluna Pago com o `total_pago` do backend.**

## Tarefas

1. **Tarefa 1 (tracer): ordem dos clientes da URL ate a tabela** - commit `773b1a3`. Removidos `SortKey`, `SortDir`, `CLIENTE_SORT_COLUMNS`, os dois `useState` e `handleSort`. A ordem vem de `lerOrdenacao(obter("ordem"), obter("dir"), CONFIG_CLIENTES)`; `mudarOrdenacao` grava com `definir(ordenacaoParaUrl(...))` (mantem status e busca); `clientesOrdenados = ordenarClientes(clientesFiltrados, ordenacao)`. O cartao ganhou `pa-card-header` com "Clientes (N)" e `SeletorOrdenacao`; o `thead` usa `ThOrdenavel` para Cliente, Total devido e Atrasado.
2. **Tarefa 2: coluna e criterio Pago** - commit `a6705ee`. `ClienteDevedor.total_pago?: number | null`; `ThOrdenavel` ordem "pago"; celula com `title="Total já pago pelo cliente (histórico do Athos)"`, valor com `formatBRL` (inclusive 0) ou traco `text-muted` quando null/undefined.

Portao do tracer: tsc, build e `checar-ordenacao.mjs` foram executados de ponta a ponta apos o commit da Tarefa 1 e passaram antes da Tarefa 2.

## Resultados reais da verificacao

- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 (apos cada tarefa).
- `npm --prefix apps/frontend run build`: exit 0 (apos cada tarefa); `next-env.d.ts` restaurado com `git checkout --`, sem diferenca no status.
- `checar-ordenacao.mjs` (21 linhas OK), `checar-filtros-boletos.mjs`, `checar-filtros-url.mjs`, `checar-notas.mjs`: todos exit 0 (Node v22.22.1).
- Greps: `handleSort` = 0; `useState<SortKey>` = 0; `ordenarClientes(clientesFiltrados, ordenacao)` = 1; `CONFIG_CLIENTES` = 7; `ThOrdenavel` = 5 (import + 4 cabecalhos; 4 apos a Tarefa 1); `SeletorOrdenacao` = 2; `total_pago` = 3; `ordem="pago"` = 1; "Total já pago pelo cliente" = 1.

## Deviations from Plan

Nenhuma de regra 1-4; plano executado como escrito. Observacoes de ambiente:

- Worktree reposicionado com `git reset --hard 57c0f20` (HEAD do checkout principal, inclui 48-01 e 48-02).
- Sem `node_modules` no worktree: symlinks para os do repo principal, nao commitados (aparecem como `??`).
- Apenas `page.tsx` foi tocado; fetch do dashboard, filtro de status, busca, autocomplete, cartoes, aging e indicadores intactos (D-03 da fase 47); nenhuma escrita no Athos.

## Known Stubs

Nenhum. Antes do deploy do backend 48-02 o campo `total_pago` nao vem e a coluna mostra traco; e o comportamento previsto (D-04), nao um stub.

## Threat Flags

Nenhum. T-48-06 mitigado: `ordem`/`dir` passam por `lerOrdenacao` com `CONFIG_CLIENTES`; invalido vira o padrao; `status` e `busca` seguem com `lerOpcao`/`lerTexto`. T-48-07: mesma pagina atras do `PasswordGate` e mesmo proxy autenticado; nenhuma rota nova.

## Verificacao humana pendente (pos-fase)

Em /contas-receber escolher uma ordem e trocar o filtro de status (as duas ficam na URL), ordenar por Nome e por Pago, dar F5 e conferir o Pago de um cliente com o "Total pago" da tela dele. Nao validado visualmente aqui (sem navegador); validado por tsc, build e os casos executaveis de `ordenarClientes`.

## Self-Check: PASSED

- `apps/frontend/src/app/contas-receber/page.tsx` existe e contem as mudancas.
- Commits `773b1a3` e `a6705ee` presentes no historico do worktree.
