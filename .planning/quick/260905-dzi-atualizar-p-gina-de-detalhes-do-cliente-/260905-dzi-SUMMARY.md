---
phase: quick-260905-dzi
plan: 01
subsystem: api
tags: [nestjs, pg, postgresql-9.0, athos, contas-a-receber, react, nextjs]

# Dependency graph
requires:
  - phase: 27
    provides: "Dashboard de Contas a Receber (buscarDashboardContasReceber) — padrao de summary via Array.reduce em Node reaproveitado no calculo de mesMaiorGasto"
  - phase: 28
    provides: "Pagina de Detalhe do Cliente (/contas-receber/[idcliente]) — pagina base ampliada por este quick task"
provides:
  - "GET /athos/contas-receber/cliente/:idcliente/historico — endpoint agregado com pagos, itensPorValor, itensPorQuantidade, meses, mesMaiorGasto"
  - "AthosService.buscarHistoricoClienteContasReceber(idcliente) — metodo unico com 5 consultas isoladas por try/catch no mesmo PoolClient"
affects: [contas-a-receber, athos-integration, cliente-detalhe]

# Actuals (#2632)
actuals:
  tokens: 10800
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multiplas consultas isoladas no mesmo PoolClient, cada uma com try/catch proprio degradando para valor vazio/zero (D-03) — evita que uma falha isolada zere metricas ja calculadas"
    - "Agregacao mensal via SQL (date_trunc + to_char + GROUP BY ordinal) seguida de reduce em Node para o pico (mesMaiorGasto) — mesmo idioma do summary do dashboard de contas a receber"

key-files:
  created:
    - apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts
    - apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx

key-decisions:
  - "Conta paga definida pelo JOIN conta_receber + conta_recebida (D-01), nunca por statusconta — unica definicao auto-evidente com o banco Athos inacessivel desta maquina no momento da execucao"
  - "Duas consultas separadas para itens mais comprados (por valor e por quantidade, D-04) — um top-10 por valor esconderia itens baratos comprados muitas vezes"
  - "SQL compativel com PostgreSQL 9.0.5 (D-02): SUM(CASE WHEN...), GROUP BY com ordinal, date_trunc + to_char, ANY($1) — sem FILTER, LATERAL ou GROUPING SETS"

patterns-established:
  - "Metodo agregado unico por tela (buscarHistoricoClienteContasReceber) que cresce aditivamente entre tasks, cada task fechando ponta-a-ponta (banco -> service -> controller -> proxy -> UI) sem reabrir PoolClient"

requirements-completed: [QT-DZI-01, QT-DZI-02, QT-DZI-03]

coverage:
  - id: D1
    description: "Pagina /contas-receber/{id} exibe contas ja pagas do cliente (titulo, vencimento, data de pagamento, valor pago) alem dos titulos em aberto"
    requirement: "QT-DZI-01"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts — mapeamento de pagos, agregado independente do LIMIT, degradacao isolada"
        status: pass
      - kind: manual_procedural
        ref: "http://localhost:3000/contas-receber/2829 com rede Athos (Tailscale) — nao executado nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Banco Athos de producao inacessivel desta maquina (exige Tailscale) — verificacao contra dados reais fica pendente, ver secao Verificacao Humana Pendente"
  - id: D2
    description: "Pagina mostra itens mais comprados em duas leituras (por valor e por quantidade)"
    requirement: "QT-DZI-02"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts — ordens distintas entre os dois arrays, fallback de descricao, degradacao isolada"
        status: pass
      - kind: manual_procedural
        ref: "http://localhost:3000/contas-receber/2829 com rede Athos (Tailscale) — nao executado nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Banco Athos de producao inacessivel desta maquina — verificacao visual da alternancia e dos valores reais fica pendente"
  - id: D3
    description: "Pagina mostra item de maior gasto e mes de maior gasto com o valor daquele mes"
    requirement: "QT-DZI-03"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts — mesMaiorGasto correto mesmo fora da primeira posicao, serie vazia, degradacao isolada"
        status: pass
      - kind: manual_procedural
        ref: "http://localhost:3000/contas-receber/2829 com rede Athos (Tailscale) — nao executado nesta sessao"
        status: unknown
    human_judgment: true
    rationale: "Banco Athos de producao inacessivel desta maquina — checagem contra o extrato real do cliente fica pendente"

duration: ~25min
completed: 2026-09-05
status: complete
---

# Quick Task 260905-dzi: Histórico de Consumo na Página de Detalhe do Cliente Summary

**Endpoint agregado novo `GET /athos/contas-receber/cliente/:idcliente/historico` (contas pagas, itens mais comprados por valor/quantidade, série mensal e mês de maior gasto) somado à página `/contas-receber/[idcliente]` sem alterar nada pré-existente.**

## Performance

- **Duration:** ~25min
- **Tasks:** 3/3 completos
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments

- Contas já pagas do cliente exibidas com título, vencimento, data de pagamento, valor pago, juros, desconto e pedido — total agregado independente do LIMIT de exibição (200 linhas)
- Itens mais comprados em duas leituras explícitas (por valor gasto e por quantidade comprada), com alternância de botões no frontend e sem reordenar no cliente
- Três cards de resumo (Total Já Pago, Mês de Maior Gasto, Item de Maior Gasto) e tabela "Gasto por Mês" com os 12 meses mais recentes, destacando o mês de pico
- Todas as 5 consultas novas rodam num único `PoolClient`, cada uma com `try/catch` isolado — falha em qualquer consulta degrada apenas o próprio bloco (D-03)
- Nada pré-existente na página mudou (dados cadastrais, títulos em aberto, boletos, NFS-e Emitidas, Notas Fiscais Athos) — `git diff --stat` confirma que só os 5 arquivos do plano foram tocados

## Task Commits

Each task was committed atomically:

1. **Task 1: Contas já pagas ponta-a-ponta** - `f823003` (feat)
2. **Task 2: Itens mais comprados por valor e por quantidade** - `30492e2` (feat)
3. **Task 3: Mês de maior gasto + cards de resumo** - `23c7438` (feat)

## Files Created/Modified

- `apps/backend/src/modules/integrations/athos/athos.service.ts` - `buscarHistoricoClienteContasReceber` — 5 consultas (pagos, agregado, itensPorValor, itensPorQuantidade, meses) no mesmo PoolClient
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` - Rota `GET contas-receber/cliente/:idcliente/historico` com `validateAthosToken` e Swagger
- `apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts` - 12 testes unitários com `pg` mockado cobrindo mapeamento, agregação, ordens distintas, fallback de descrição e degradação isolada por consulta
- `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts` - Proxy Next injetando `x-api-token` server-side
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` - Cards de resumo + seções "Contas Pagas", "Itens Mais Comprados" (com toggle) e "Gasto por Mês"

## Decisions Made

- D-01: "Conta paga" definida pelo JOIN `conta_receber` + `conta_recebida` (FK + UNIQUE), nunca por `statusconta` — os códigos de status não são confiáveis e o banco Athos estava inacessível desta máquina para verificação
- D-02: SQL compatível com PostgreSQL 9.0.5 em toda consulta nova — sem `FILTER`, `LATERAL` ou `GROUPING SETS`
- D-04: Duas consultas de itens (por valor e por quantidade) em vez de uma lista reordenada no cliente — evita esconder itens baratos comprados muitas vezes
- D-05: Agregação mensal usa `conta_recebida.datapagamento` (dinheiro que entrou), não a data da venda — rótulo explícito na UI
- D-06: UI segue o idioma Bootstrap já existente na página (`card border-0 shadow-sm`, `table table-sm table-hover table-bordered`, ícones `bi`) — zero classes `pa-*`, zero CSS novo

## Deviations from Plan

None - plan executed exatamente como escrito. As 5 arquivos tocados batem exatamente com `files_modified` do frontmatter do plano.

## Issues Encountered

None.

## Verificação Humana Pendente

O banco Athos de produção está inacessível desta máquina sem rede Tailscale (mesma limitação registrada no planejamento, D-01). A checagem humana do plano (`Task 3 <human-check>`) — abrir `http://localhost:3000/contas-receber/2829` com Tailscale ativo e conferir contas pagas, itens mais comprados e mês de maior gasto contra o extrato real do cliente — **não foi executada nesta sessão** e fica como follow-up. Toda a lógica foi validada via suíte unitária com `pg` mockado (12/12 testes verdes) e `tsc --noEmit` limpo no frontend.

## Follow-up de Segurança (T-DZI-02)

O novo endpoint `.../historico` expõe histórico de compras de qualquer `idcliente` para quem alcança o app — exatamente a mesma superfície já aberta por `.../titulos` e `.../dados`, consumidos pela mesma página. O `PasswordGate` hoje cobre apenas `/contas-receber` (dashboard), não `/contas-receber/[idcliente]`. Fechar essa lacuna é mudança de escopo própria, registrada aqui como disposição `accept` no threat model do plano — não bloqueia esta entrega, mas deve ser considerada num quick task futuro de hardening da página de detalhe.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Endpoint e UI prontos para uso assim que a rede Athos (Tailscale) estiver disponível para a checagem humana pendente acima
- Nenhum bloqueio para outros trabalhos — mudança é puramente aditiva e não altera comportamento pré-existente

---
*Quick Task: 260905-dzi*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/integrations/athos/athos.service.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos.controller.ts
- FOUND: apps/backend/src/modules/integrations/athos/athos.service.historico-cliente.test.ts
- FOUND: apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/historico/route.ts
- FOUND: apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
- FOUND commit: f823003
- FOUND commit: 30492e2
- FOUND commit: 23c7438
