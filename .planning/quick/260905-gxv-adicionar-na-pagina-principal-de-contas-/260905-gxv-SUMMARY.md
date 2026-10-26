---
phase: quick-260905-gxv
plan: 01
subsystem: fullstack
tags: [nestjs, nextjs, postgres, athos, contas-a-receber, dashboard, widgets]

# Dependency graph
requires:
  - phase: 27
    provides: "Dashboard de Contas a Receber (buscarDashboardContasReceber) — padrao de PoolClient unico + queries independentes reaproveitado em buscarIndicadoresContasReceber"
  - phase: quick-260905-ena
    provides: "AdminShell/PlainAdmin (sidebar/topbar) e classes pa-* (pa-stat-grid, pa-pill-warning, pa-pill-danger, pa-empty-erro, pa-card-body-flush) — reaproveitadas sem alteracao"
provides:
  - "GET /athos/contas-receber/dashboard/indicadores — topProduto, topServico, clientesInativos, totalClientesInativos, truncado"
  - "AthosService.buscarIndicadoresContasReceber() — 4 consultas isoladas por try/catch no mesmo PoolClient"
affects: [contas-a-receber, athos-integration, dashboard-principal]

# Actuals (#2632)
actuals:
  tokens: 8400
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quatro consultas independentes no mesmo PoolClient, cada uma com try/catch proprio degradando para null/[]/0 (D-03) — mesmo idioma ja usado em buscarDashboardContasReceber e buscarHistoricoClienteContasReceber"
    - "Tracer (Task 1) entrega o contrato completo do endpoint com dois campos reais e tres campos com defaults documentados no proprio codigo; Task 2 substitui so os defaults, sem tocar assinatura/rota/proxy"

key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts
    - apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
    - apps/frontend/src/app/contas-receber/page.tsx

key-decisions:
  - "produto.tipoproduto = true -> produto fisico, COALESCE(tipoproduto,false) = false -> servico (D-04) — mesma coluna ja usada em producao por verificarTipoProdutoVenda"
  - "'Cliente fez pedido' = existe >=1 linha em venda com aquele idcliente (D-01) — join parte de venda, entao cliente sem nenhum pedido nunca aparece na lista de inativos"
  - "Lista de inativos com LIMIT 100 + consulta COUNT separada para o total (D-05) — mesmo padrao truncado/totalPago do plano irmao 260905-dzi"
  - "SQL compativel com PostgreSQL 9.0.5 (D-02): sem FILTER, LATERAL, GROUPING SETS — GROUP BY completo, HAVING MAX(...), subquery em FROM para o total"
  - "Sem filtro de venda.cancelada em nenhuma consulta nova (D-06) — mesmo criterio ja usado por buscarItensVenda/itensPorValor/itensPorQuantidade"

patterns-established:
  - "Tracer feedback gate: Task 1 fecha o caminho ponta-a-ponta (banco -> service -> controller -> proxy -> UI) com 2 dos 5 campos do contrato reais antes da Task 2 expandir horizontalmente o mesmo endpoint"

requirements-completed: [QT-GXV-01, QT-GXV-02]

coverage:
  - id: D1
    description: "Bloco 'Item Mais Vendido (Historico)' com produto fisico e servico separados, loja toda, sem filtro de data"
    requirement: "QT-GXV-01"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts — dados reais, fallback de descricao, degradacao isolada por consulta"
        status: pass
      - kind: manual_procedural
        ref: "http://localhost:3000/contas-receber com rede Athos (Tailscale) — nao executado nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Banco Athos de producao inacessivel desta maquina (sem Tailscale) — verificacao contra dados reais fica pendente, ver secao Verificacao Humana Pendente"
  - id: D2
    description: "Bloco 'Clientes Inativos' com clientes que ja fizeram pedido mas nao pedem ha mais de 180 dias, mostrando ultimo pedido e dias sem pedido"
    requirement: "QT-GXV-02"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts — Date vs string, total via agregado, truncado em 100 linhas, degradacao isolada, release mesmo com as 4 consultas falhando"
        status: pass
      - kind: manual_procedural
        ref: "http://localhost:3000/contas-receber com rede Athos (Tailscale) — nao executado nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Banco Athos de producao inacessivel desta maquina — checagem de que clientes conhecidos e realmente inativos aparecem (e nenhum novo aparece) fica pendente"

duration: ~20min
completed: 2026-09-05
status: complete
---

# Quick Task 260905-gxv: Item Mais Vendido e Clientes Inativos na Página Principal de Contas a Receber Summary

**Endpoint agregado novo `GET /athos/contas-receber/dashboard/indicadores` (produto/serviço mais vendidos desde o início + lista de clientes inativos há mais de 180 dias) somado à página `/contas-receber` sem alterar nenhum dado pré-existente.**

## Performance

- **Duration:** ~20min
- **Tasks:** 2/2 completos
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments

- Bloco "Item Mais Vendido (Histórico)" mostrando o produto físico e o serviço de maior receita histórica, separados via `produto.tipoproduto`, cobrindo a loja toda desde o início (sem filtro de data)
- Bloco "Clientes Inativos" listando clientes que já fizeram pedido mas não pedem há mais de 180 dias, com último pedido, dias sem pedido (pill de severidade) e total de pedidos, ordenados do mais tempo sumido para o menos
- Clientes que nunca fizeram nenhum pedido nunca aparecem na lista de inativos (join parte de `venda`, não de `cliente`)
- Quatro consultas novas rodam num único `PoolClient`, cada uma com `try/catch` isolado — falha em qualquer uma degrada apenas o próprio campo (`topProduto`/`topServico` nulos, `clientesInativos` vazio) sem derrubar a página nem os widgets pré-existentes
- Nada pré-existente na página mudou (resumo de inadimplência, aging, a vencer, boletos consolidados, tabela de clientes devedores) — `git diff --stat` confirma que só os 5 arquivos do plano foram tocados

## Task Commits

Each task was committed atomically:

1. **Task 1: Item Mais Vendido (Histórico) ponta-a-ponta — produto vs serviço** - `9a56ed9` (feat)
2. **Task 2: Clientes Inativos — lista ponta-a-ponta** - `8ac1f99` (feat)

## Files Created/Modified

- `apps/backend/src/modules/integrations/athos/athos.service.ts` - `buscarIndicadoresContasReceber()` — 4 consultas (topProduto, topServico, clientesInativos, totalClientesInativos) no mesmo `PoolClient`
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` - Rota `GET contas-receber/dashboard/indicadores` com `validateAthosToken` e Swagger
- `apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts` - 14 testes unitários com `pg` mockado cobrindo dados reais, fallback de descrição, Date vs string, total via agregado, truncado, degradação isolada por consulta e release do client
- `apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts` - Proxy Next protegido por `requireAdminSession`, injetando `x-api-token` server-side
- `apps/frontend/src/app/contas-receber/page.tsx` - Seções "Item Mais Vendido (Histórico)" (dois cards `pa-stat`) e "Clientes Inativos" (tabela com pill de severidade e link "Ver Detalhe"), com fetch e estado próprios num `useEffect` separado do `fetchDashboard` existente

## Decisions Made

- D-01: "Pedido" é a linha em `venda` (join por `idcliente`); "não pede há mais de 180 dias" = `MAX(venda.data) < CURRENT_DATE - INTERVAL '180 days'`
- D-02: SQL compatível com PostgreSQL 9.0.5 em toda consulta nova — sem `FILTER`, `LATERAL` ou `GROUPING SETS`
- D-04: Duas consultas separadas para `topProduto`/`topServico` (uma filtrando `tipoproduto = true`, outra `false`) em vez de uma única consulta com `CASE` reordenada no Node
- D-05: `clientesInativos` com `LIMIT 100` na lista + consulta `COUNT` separada para `totalClientesInativos` — a lista tem limite de exibição, o total não depende dele
- D-06: Sem filtro de `venda.cancelada` em nenhuma consulta nova — mesmo critério já usado por `buscarItensVenda`/`itensPorValor`/`itensPorQuantidade`
- D-09: UI 100% no idioma PlainAdmin já existente na página (`pa-card`, `pa-stat`, `pa-table`, `pa-pill*`, `pa-empty*`) — zero alteração em `admin-shell.tsx`

## Deviations from Plan

None - plano executado exatamente como escrito. Os 5 arquivos tocados batem exatamente com `files_modified` do frontmatter do plano (confirmado via `git diff --name-only` após cada task).

## Issues Encountered

Worktree estava desatualizado em relação a `main` no início da execução (faltavam commits das quick tasks `260905-cyr`/`260905-dzi`/`260905-ena` e da Fase 41). Sincronizado via `git merge main --no-edit` antes de iniciar qualquer task, conforme orientação de desvio do plano. Sem conflitos.

## Verificação Humana Pendente

O banco Athos de produção está inacessível desta máquina sem rede Tailscale (mesma limitação registrada nos planos irmãos `260905-dzi`/`260905-ena`). A checagem humana do plano (`Task 2 <human-check>`) — abrir `http://localhost:3000/contas-receber` com Tailscale ativo e conferir se o produto/serviço mais vendidos e a lista de clientes inativos batem com o histórico real da loja — **não foi executada nesta sessão** e fica como follow-up. Toda a lógica foi validada via suíte unitária com `pg` mockado (14/14 testes novos verdes, 76/76 regressão do módulo athos) e `tsc --noEmit` + `next build` limpos no frontend.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- Endpoint e UI prontos para uso assim que a rede Athos (Tailscale) estiver disponível para a checagem humana pendente acima
- Nenhum bloqueio para outros trabalhos — mudança é puramente aditiva e não altera comportamento pré-existente

---
*Quick Task: 260905-gxv*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/integrations/athos/athos.service.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos.controller.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos.service.indicadores.test.ts
- FOUND: apps/frontend/src/app/api/athos/contas-receber/dashboard/indicadores/route.ts
- FOUND: apps/frontend/src/app/contas-receber/page.tsx
- FOUND commit: 9a56ed9
- FOUND commit: 8ac1f99
