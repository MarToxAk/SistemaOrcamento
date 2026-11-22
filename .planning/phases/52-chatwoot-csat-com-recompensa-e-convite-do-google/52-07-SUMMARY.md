---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 07
subsystem: pesquisa-satisfacao
tags: [cupom, recompensa, prisma, nestjs, transacao, advisory-lock, centavos, timezone, class-validator]
status: complete
requires:
  - phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
    provides: 52-03 (pesquisa-regras com dinheiro em centavos/mes de Sao Paulo/situacao derivada/validarConfig, PesquisaConfigService.obter e PesquisaService.gastoDoMesCentavos)
provides:
  - PesquisaConfigService.atualizar com normalizacao, validacao no servidor e erro por campo (BadRequestException { message, campos })
  - AtualizarPesquisaConfigDto com class-validator em todos os campos (ValidationPipe global usa forbidNonWhitelisted)
  - PesquisaCupomService.buscarPorCodigo/listar/resgatar com transacao, pg_advisory_xact_lock, teto mensal rigido e uso unico
  - PesquisaResultadosService.resultados com taxa n de N, comparativo por variante com amostraPequena, cupons, gasto do mes, distribuicao, ultimas 20 com revogada e relatorioChatwootUrl
  - PesquisaCupomService e PesquisaResultadosService registrados em PesquisaModule (providers e exports)
affects: [52-10 (tela de cupons), 52-09 (painel de resultados), 52-12 (controller admin e revogacao)]
tech-stack:
  added: []
  patterns:
    - resgate atomico em transacao Prisma com pg_advisory_xact_lock e updateMany condicionado ao status de origem
    - erro de API por campo no formato { message: string[], campos: Record<string, string> }
    - Decimal do Prisma convertido com Number(String(valor)) apenas na borda; dinheiro em centavos inteiros
    - telefone sempre mascarado nos retornos (mascararTelefone), anonimizado vira "*****"
key-files:
  created:
    - apps/backend/src/modules/pesquisa/dto/atualizar-pesquisa-config.dto.ts
    - apps/backend/src/modules/pesquisa/pesquisa-cupom.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa-cupom.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa-resultados.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa-resultados.service.test.ts
  modified:
    - apps/backend/src/modules/pesquisa/pesquisa-config.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa.module.ts
key-decisions:
  - "O advisory lock usa uma chave fixa (520001) para o teto mensal: qualquer resgate que possa estourar o teto serializa na mesma transacao do gasto lido."
  - "O resgate usa o snapshot do cupom (percentual, teto e compra minima da emissao), nunca a config atual; so o teto mensal vem da config viva."
  - "Mais de 2 casas decimais nos valores monetarios e recusado no servico com 'Use no máximo 2 casas decimais.', independente do DTO."
  - "Pesquisas revogadas continuam contando nas metricas; o campo revogada permite a tela esconder a acao."
  - "A taxa por variante usa o mesmo criterio da taxa geral (respondidas / enviadas daquela variante)."
patterns-established:
  - "Transacao com lock + updateMany condicionado + contagem === 1 como padrao de acao de caixa de uso unico."
  - "Validacao de config como fonte unica (validarConfig) chamada pelo DTO e pelo servico."
metrics:
  duration: "~14min"
  completed: 2026-11-22
commits: 2
plan_head_before: 246bda28c7a4bf56e7d3a4b36cdb2a6cd5ec4612
plan_head_after: c44f7a164c1c12fbc6914ba08cbf1d6fd34c9d5e
actuals:
  tokens: 17672
  tasks: 2
  commits: 2
requirements-completed: []
coverage:
  - id: D1
    description: "Configuracao da pesquisa gravada inteira com validacao no servidor, normalizacao e erro por campo; DTO com class-validator"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts#PesquisaConfigService.atualizar + AtualizarPesquisaConfigDto (18 testes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cupons: detalhe mascarado com situacao derivada, lista paginada por filtro e resgate atomico com teto rigido e uso unico"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-cupom.test.ts#PesquisaCupomService (21 testes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Resultados do painel: nota media, taxa n de N, variantes com amostra pequena, cupons, gasto contra teto, distribuicao, ultimas respostas e relatorioChatwootUrl"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-resultados.service.test.ts#PesquisaResultadosService.resultados (10 testes)"
        status: pass
    human_judgment: false
---

# Phase 52 Plan 07: Serviços administrativos de pesquisa, cupons e resultados

**Configuração da pesquisa validada e gravada no servidor, resgate de cupom atômico com teto mensal rígido e uso único, e painel de resultados com taxa n de N e sinal de amostra pequena.**

## Performance

- **Duration:** ~14min
- **Started:** 2026-11-22T18:29:57Z
- **Completed:** 2026-11-22T18:35:00Z
- **Tasks:** 2
- **Files modified:** 8 (5 criados, 3 modificados)

## Accomplishments

- `PesquisaConfigService.atualizar` grava a config inteira de uma vez, normaliza prefixo (maiúsculas), link (vazio → null) e textos (trim), valida com `validarConfig` e devolve `BadRequestException({ message: string[], campos })` com mensagens em português; o log registra só a mudança de `ativo`.
- `AtualizarPesquisaConfigDto` cobre todos os campos com class-validator (bool, números com 2 casas, inteiros, textos limite 2000, `linkGoogle` anulável, variante fechada), compatível com o `ValidationPipe` global (`forbidNonWhitelisted`).
- `PesquisaCupomService` entrega detalhe com telefone mascarado e situação derivada (EMITIDO/SUSPENSO/USADO/EXPIRADO/CANCELADO, com `suspensoAte`), lista paginada por cursor (50/100) com filtros e resgate atômico: lock `pg_advisory_xact_lock(520001)`, recálculo no servidor, teto rígido (`gasto + desconto > teto` → 422 com `liberadoEm`) e `updateMany` condicionado a EMITIDO+validade (dois resgates simultâneos → um 200 e um 409).
- `PesquisaResultadosService` monta nota média, taxa de resposta com par n de N, comparativo por variante com `amostraPequena` (< 30 respostas), cupons emitidos/usados/vencidos, gasto real do mês contra o teto (sempre o mês de São Paulo), distribuição 1–5, últimas 20 respostas com `revogada` e situação do cupom, e `relatorioChatwootUrl` a partir das envs.
- Ambos os serviços registrados em `PesquisaModule` (providers e exports) para o controller do plano 52-12.

## Task Commits

1. **Task 1: Gravar a configuração com validação no servidor** - `0f13b4f` (feat)
2. **Task 2: Cupons e resultados do painel** - `c44f7a1` (feat)

**Plan metadata:** commit do SUMMARY (docs).

## Files Created/Modified

- `apps/backend/src/modules/pesquisa/dto/atualizar-pesquisa-config.dto.ts` - DTO da config com class-validator em todos os campos.
- `apps/backend/src/modules/pesquisa/pesquisa-config.service.ts` - `atualizar` com normalização, validação e log só de ativo.
- `apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts` - +13 testes (serviço e DTO).
- `apps/backend/src/modules/pesquisa/pesquisa-cupom.service.ts` - consulta, lista e resgate atômico.
- `apps/backend/src/modules/pesquisa/pesquisa-cupom.test.ts` - 21 testes (resgate, situações, teto, lista).
- `apps/backend/src/modules/pesquisa/pesquisa-resultados.service.ts` - `ResultadosDTO` e montagem do painel.
- `apps/backend/src/modules/pesquisa/pesquisa-resultados.service.test.ts` - 10 testes (métricas, períodos, gasto, últimas).
- `apps/backend/src/modules/pesquisa/pesquisa.module.ts` - registra e exporta `PesquisaCupomService` e `PesquisaResultadosService`.

## Decisions Made

- Advisory lock com chave fixa por teto mensal: resgates concorrentes serializam a leitura do gasto e a gravação.
- Snapshot do cupom é a fonte do percentual/teto/compra mínima; só o teto mensal é lido da config atual.
- Limite de 2 casas decimais aplicado no serviço além do DTO, para o caso de a tela falhar.
- Pesquisas revogadas continuam nas métricas; `revogada` permite esconder a ação na tela.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- O worktree não tem `node_modules` próprio: jest e tsc foram executados a partir de `/root/SistemaOrcamento/node_modules` (a resolução de módulos sobe até a raiz do monorepo). Nenhuma alteração de código foi necessária.
- Um teste próprio de 404 foi ajustado: para código bem formado e inexistente o serviço precisa consultar o banco dentro da transação; a asserção de "não consulta" ficou só para o código fora de formato.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Pronto para o plano 52-12 expor `PUT /pesquisa/config`, `GET /pesquisa/resultados` e as rotas de cupons com `@AdminOnly`.
- Pronto para as telas dos planos 52-09 (resultados) e 52-10 (cupons) consumirem os tipos `ResultadosDTO`, `CupomListaItem` e `CupomDetalhe`.
- Nenhuma rota HTTP, guarda ou revogação foi criada neste plano, conforme o escopo.

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED
