---
phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi
plan: 01
subsystem: api
tags: [nestjs, nextjs, prisma, pg, cobranca, athos, dashboard]

requires: []
provides:
  - "AthosService.buscarNomesClientes(idclientes: number[]) — resolucao em lote de nome PF/PJ via SQL parametrizado (ANY($1))"
  - "CobrancaService.buscarBoletosDashboard() — lista cross-client de boletos nao cancelados com nfseStatus completa/parcial/pendente"
  - "GET /cobranca/boleto/dashboard — rota autenticada (InternalAuthGuard global)"
  - "Proxy Next.js GET /api/cobranca/boleto/dashboard"
  - "BoletosConsolidadosPanel — painel no topo de /contas-receber"
affects: [41-02, 41-03, contas-receber-dashboard]

actuals:
  tokens: 5649
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Resolucao de nome de cliente em lote via WHERE idcliente = ANY($1) (evita N+1 contra o Athos)"
    - "Map<idclienteAthos, nomeCliente> para enriquecimento de linhas sem herdar nome de outra linha"
    - "nfseStatus derivado de um Set<idcontareceber> construido a partir de UMA unica consulta Prisma em lote"

key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts
    - apps/frontend/src/app/api/cobranca/boleto/dashboard/route.ts
  modified:
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/frontend/src/app/contas-receber/page.tsx

key-decisions:
  - "nfseStatus fixado em 'pendente' na Task 1 e calculado de verdade so na Task 2, reaproveitando buscarNfseEmitidaParaTitulos ja existente (sem nova consulta ao banco nem chamada por titulo ao Athos)"
  - "Tooltip do badge de NFS-e usa contagem aproximada (N de N para completa, 0 de N para pendente, texto generico para parcial) em vez de numerador exato, pois o contrato de buscarBoletosDashboard (locked na secao <interfaces> do plano) so expoe titulos: number[] + nfseStatus agregado, sem breakdown por titulo — expandir o contrato seria mudanca de arquitetura (Rule 4), evitada por ser cosmetica"

patterns-established:
  - "Painel independente com seu proprio loading/erro/fetch, renderizado antes do ternario de loading do dashboard existente, para isolar falhas (D-06 requirement)"

requirements-completed: [D-06, D-08]

coverage:
  - id: D1
    description: "Painel consolidado de boletos nao cancelados de todos os clientes no topo de /contas-receber (nome, valor, vencimento, dias para vencer, status)"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts#resolve o nome de cada cliente em uma unica chamada em lote ao Athos"
        status: pass
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts#ordena por expireAt ascendente com expireAt null por ultimo"
        status: pass
    human_judgment: true
    rationale: "Renderizacao visual real do painel (layout, truncamento de nome, badges, botao Ver Cliente) so pode ser confirmada olhando a pagina renderizada no navegador; os testes unitarios cobrem apenas a camada de servico"
  - id: D2
    description: "Cada linha do painel mostra o estado da NFS-e dos titulos do boleto (completa/parcial/pendente) com uma unica consulta em lote"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts#marca nfseStatus=completa quando todos os titulos do boleto tem NFS-e emitida"
        status: pass
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts#consulta o estado de NFS-e uma unica vez para todos os boletos"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-04
status: complete
---

# Phase 41 Plan 01: Painel Consolidado de Boletos + Indicador de NFS-e Summary

**Painel dinamico no topo de /contas-receber listando todos os boletos nao cancelados de todos os clientes, com resolucao de nome em lote via Athos e badge de NFS-e completa/parcial/pendente por boleto, sem N+1 em nenhuma das duas fontes.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 6 (2 novos, 4 modificados)

## Accomplishments
- `AthosService.buscarNomesClientes` resolve nome PF/PJ de N clientes numa unica query parametrizada (`WHERE c.idcliente = ANY($1)`), com fallback seguro (`[]` em erro, nunca derruba a rota).
- `CobrancaService.buscarBoletosDashboard()` entrega a lista cross-client de boletos nao cancelados, com nome de cliente resolvido via `Map` (nunca herda nome de outra linha), `diasParaVencer` calculado e ordenacao por `expireAt` ascendente com nulos por ultimo.
- `GET /cobranca/boleto/dashboard` protegido pelo `InternalAuthGuard` global (sem `@Public()` — contagem no controller permanece em 3).
- Proxy Next.js `/api/cobranca/boleto/dashboard` com `requireAdminSession` antes de qualquer chamada ao backend; nao duplica header (`backendFetch` ja injeta `x-internal-api-key`).
- `BoletosConsolidadosPanel` no topo de `/contas-receber`, com loading/erro/estado-vazio proprios e independentes do resto do dashboard.
- `nfseStatus` (completa/parcial/pendente) calculado reaproveitando `buscarNfseEmitidaParaTitulos` existente, com uma unica consulta `nfseEmitidaTitulo.findMany` para todos os boletos; badge correspondente no frontend com tooltip nativo.

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Painel consolidado de boletos ponta a ponta (D-06)**
   - `9fca10b` test(41-01): add failing tests for buscarBoletosDashboard (RED)
   - `4eebfd3` feat(41-01): painel consolidado de boletos a receber ponta a ponta (D-06)
2. **Task 2: Indicador de NFS-e emitida vs pendente por boleto (D-08)**
   - `87ca55c` test(41-01): add failing tests for nfseStatus completa/parcial (RED)
   - `80164eb` feat(41-01): indicador de NFS-e completa/parcial/pendente por boleto (D-08)

_Note: split into RED/GREEN commits per task per the tdd="true" tag on both tasks._

## Files Created/Modified
- `apps/backend/src/modules/integrations/athos/athos.service.ts` - `buscarNomesClientes(idclientes)`, inserido apos `buscarDadosClienteContasReceber`
- `apps/backend/src/modules/cobranca/cobranca.service.ts` - `buscarBoletosDashboard()` + tipo `NfseStatusBoleto`
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` - handler `boletosDashboard()` em `GET boleto/dashboard`
- `apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts` (novo) - 9 testes cobrindo D-06 e D-08
- `apps/frontend/src/app/api/cobranca/boleto/dashboard/route.ts` (novo) - proxy autenticado
- `apps/frontend/src/app/contas-receber/page.tsx` - `BoletosConsolidadosPanel` + badges de status/NFS-e

## Decisions Made
- `nfseStatus` fixado em `"pendente"` na Task 1 (contrato ja fechado) e calculado de verdade so na Task 2, exatamente como instruido no plano — evita mudanca de forma do retorno no meio da fatia vertical.
- Tooltip do badge de NFS-e usa contagem aproximada em vez de numerador exato para o caso "parcial", porque o contrato locked de `buscarBoletosDashboard` (secao `<interfaces>` do plano) nao expõe breakdown por titulo — apenas o agregado `nfseStatus` e a lista de ids `titulos`. Adicionar essa granularidade exigiria alterar a forma do retorno (mudanca de arquitetura, Rule 4); como o pedido do plano ("por exemplo o texto de 2 de 3...") era so um exemplo de tom, optei por manter o contrato como especificado e usar um texto aproximado no tooltip.

## Deviations from Plan

None architecturally significant - plan executed as written, com uma correcao de sequenciamento de TDD (ver abaixo).

### Auto-fixed Issues

**1. [Processo TDD - sem impacto funcional] Separacao dos 9 testes entre RED da Task 1 e RED da Task 2**
- **Found during:** Verificacao da Task 1 (rodar a suite apos escrever todos os 9 testes de uma vez)
- **Issue:** Escrevi inicialmente os 9 testes (5 da Task 1 + 4 da Task 2) num unico arquivo antes de implementar `buscarBoletosDashboard`. Isso quebrou o `<verify>` da Task 1, cujo `<automated>` roda a suite inteira e falha se o exit code for diferente de zero — os 4 testes de `nfseStatus` (ainda nao implementados nesta task) derrubavam o exit code mesmo com os 5 testes corretos da Task 1 passando.
- **Fix:** Removi temporariamente os 4 testes de `nfseStatus`/consulta-unica do arquivo, deixando so os 5 da Task 1 para o commit RED+GREEN da Task 1; adicionei os 4 restantes de volta como um commit RED separado no inicio da Task 2, antes do commit GREEN que implementa o calculo real.
- **Files modified:** apps/backend/src/modules/cobranca/cobranca.service.dashboard.test.ts
- **Verification:** Task 1 finalizou com 5/5 testes verdes; Task 2 com 9/9.
- **Committed in:** 9fca10b/4eebfd3 (Task 1), 87ca55c/80164eb (Task 2)

---

**Total deviations:** 1 auto-fixed (processo de TDD, sem mudanca de comportamento ou contrato)
**Impact on plan:** Nenhum impacto funcional. Apenas reordenacao de quando cada teste RED foi commitado, para respeitar o `<verify>` de cada task individualmente.

## Issues Encountered
None.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-06 e D-08 entregues ponta a ponta; painel visivel em `/contas-receber` (verificacao visual/UAT humana ainda pendente, ja que este e um plano de execucao automatica/nao interativo).
- 41-02 (job de reconciliacao EFI via `@nestjs/schedule`) e 41-03 (paineis fiscais adicionais: aging, a-vencer) podem prosseguir sem dependencia deste plano alem do padrao ja estabelecido (`buscarNomesClientes`, estrutura do painel).
- Nenhum bloqueio conhecido.

---
*Phase: 41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi*
*Completed: 2026-09-04*

## Self-Check: PASSED

All 6 files created/modified confirmed present on disk. All 4 commits (9fca10b, 4eebfd3, 87ca55c, 80164eb) confirmed present in git log.
