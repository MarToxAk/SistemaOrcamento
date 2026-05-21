---
phase: 27-dashboard-contas-receber
plan: 01
subsystem: api
tags: [nestjs, postgresql, pg, athos, contas-receber]

# Dependency graph
requires:
  - phase: 19-aprovacao-associada-pagamento
    provides: padrão AthosService/AthosController com getPool(), validateAthosToken(), buscarClientes()
provides:
  - GET /api/athos/contas-receber/dashboard — summary global + top 100 clientes devedores
  - GET /api/athos/contas-receber/cliente/:idcliente/titulos — títulos ABE lazy-load por cliente
affects:
  - 27-dashboard-contas-receber (planos 02+) — frontend consome esses dois endpoints

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consulta agregada com FILTER (WHERE ...) no PostgreSQL para subtotais sem subquery"
    - "LIMIT 100 hardcoded na query de dashboard (sem parâmetro de paginação)"
    - "Validação de param numérico com Number.isFinite + > 0 + BadRequestException antes do query"

key-files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/integrations/athos/athos.controller.ts

key-decisions:
  - "LIMIT 100 hardcoded na query de dashboard — decisão D-08 do CONTEXT, sem parâmetro de paginação nesta fase"
  - "summary calculado no Node.js a partir do array mapeado (reduce), não em subquery SQL separada"
  - "datavencimento/dataemissao convertidos com instanceof Date check + toISOString().slice(0,10) para compatibilidade com o driver pg"

patterns-established:
  - "Novo método AthosService: getPool() → connect() → try { query } finally { release() } — sem catch (exceções propagam ao controller)"
  - "Rota AthosController: validateAthosToken primeiro, depois lógica — padrão aplicado em dashboardContasReceber e titulosClienteContasReceber"

requirements-completed: [CR-01, CR-02, CR-03]

# Metrics
duration: 18min
completed: 2026-05-21
---

# Phase 27 Plan 01: Dashboard Contas a Receber — Backend Summary

**Dois endpoints NestJS para dashboard de inadimplência: GET /athos/contas-receber/dashboard (summary + top 100 clientes por total_atrasado) e GET /athos/contas-receber/cliente/:idcliente/titulos (lazy-load de títulos ABE)**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-21T00:00:00Z
- **Completed:** 2026-05-21T00:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Implementados `buscarDashboardContasReceber()` e `buscarTitulosClienteContasReceber(idcliente)` em AthosService com as queries SQL exatas do CONTEXT, try/finally e tipagem TypeScript completa
- Registradas rotas GET `contas-receber/dashboard` e GET `contas-receber/cliente/:idcliente/titulos` no AthosController com decorators Swagger, validação de token timingSafeEqual e validação de parâmetro numérico
- Build TypeScript limpo (`npx tsc --noEmit` sem erros) após ambas as tasks

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Implementar buscarDashboardContasReceber() e buscarTitulosClienteContasReceber() em AthosService** - `26da828` (feat)
2. **Task 2: Registrar rotas GET contas-receber/dashboard e contas-receber/cliente/:idcliente/titulos em AthosController** - `9a38141` (feat)

## Files Created/Modified
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — adicionados 151 linhas: dois métodos públicos com queries SQL, mapeamento de tipos e padrão getPool/connect/try-finally/release
- `apps/backend/src/modules/integrations/athos/athos.controller.ts` — adicionados 37 linhas: import BadRequestException, dois métodos de rota com decorators Swagger e validação de token/param

## Decisions Made
- `summary` calculado via `Array.reduce()` no Node.js a partir do array já mapeado — evita subquery SQL adicional e mantém a query principal simples
- `datavencimento`/`dataemissao` convertidos com `instanceof Date` check antes de `.toISOString()` — o driver `pg` pode retornar Date ou string dependendo da configuração `pg.types`
- `BadRequestException` adicionado ao import destrutivo de `@nestjs/common` (Regra 2 — funcionalidade crítica ausente que o plano especificava mas não estava no import)

## Deviations from Plan

None — plano executado exatamente como especificado. `BadRequestException` estava ausente do import mas o plano já instruía adicioná-lo ("Verificar e adicionar ao import destrutivo se não estiver presente").

## Issues Encountered

None.

## User Setup Required

None — nenhuma variável de ambiente nova requerida. Os endpoints usam `ATHOS_API_TOKEN` e `ATHOS_DB_*` já configurados.

## Next Phase Readiness

- Backend completamente pronto para o frontend consumir
- `GET /api/athos/contas-receber/dashboard` retorna `{ summary, clientes }` com todos os campos especificados em D-15/D-16
- `GET /api/athos/contas-receber/cliente/:idcliente/titulos` retorna array de títulos com `numeroordem` para vínculo à venda
- Próximo plano (27-02) pode criar `apps/frontend/src/app/contas-receber/page.tsx` consumindo esses endpoints sem dependência adicional de backend

---
*Phase: 27-dashboard-contas-receber*
*Completed: 2026-05-21*
