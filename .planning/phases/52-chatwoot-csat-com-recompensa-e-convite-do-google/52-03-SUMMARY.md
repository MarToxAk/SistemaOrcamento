---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 03
subsystem: pesquisa-satisfacao
tags: [cupom, recompensa, regras-puras, prisma, nestjs, centavos, timezone]
status: complete
requires:
  - phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
    provides: 52-01 (schema PesquisaConfig/CupomRecompensa, PesquisaService, rota publica e renderizador de texto)
provides:
  - pesquisa-regras com codigo de cupom, dinheiro em centavos, mes de Sao Paulo, situacao derivada, opt-out, mascara, contraste, link do Google, validacao de mensagens/config e padroes por env
  - PesquisaConfigService.obter/padroes (singleton criado no primeiro acesso)
  - PesquisaService.gastoDoMesCentavos, avaliarRecompensa e emitirCupom com snapshot, retry e cancelamento na corrida de revogacao
  - bloco do fechamento escolhido pela elegibilidade (textoFechamento x textoSemRecompensa)
affects: [52-05 (envios e convite), 52-06 (anonimizacao), 52-07 (admin/config e resgate), 52-12 (revogacao)]
tech-stack:
  added: []
  patterns:
    - regras de dinheiro e texto em funcoes puras com testes antes da tela
    - Decimal do Prisma convertido com Number(String(valor)) apenas na borda
    - emissao best-effort que nunca derruba a nota ja gravada
key-files:
  created:
    - apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa-config.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa.service.test.ts
  modified:
    - apps/backend/src/modules/pesquisa/pesquisa-regras.ts
    - apps/backend/src/modules/pesquisa/pesquisa.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa.module.ts
    - apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts
key-decisions:
  - "notaValida como regra pura reutilizada pelo responder (fonte unica da faixa 1 a 5)."
  - "emitirCupom consulta o cupom por pesquisaId antes da elegibilidade: a idempotencia nao pode ser barrada pelo proprio cupom na regra de intervalo."
  - "Mensagens do convite nao previstas literalmente no UI-SPEC: 'O convite do Google nao pode falar de cupom.' e 'Inclua {link_google} para o convite do Google.'"
  - "Textos padrao das quatro mensagens de WhatsApp redigidos seguindo as restricoes do plano; a copy das paginas vem literal do UI-SPEC."
  - "No tracer, o create de cupom falha de proposito para manter cupom nulo e exercitar o caminho best-effort sem uma suite de cupom paralela."
metrics:
  duration: "~15min"
  completed: 2026-11-22
commits: 3
plan_head_before: 67fc297a8679fd41c95650741497e815ed4a7470
plan_head_after: eea7596e25b27877ebe6406e8bcf4653ed120eb1
actuals:
  tokens: 21288
  tasks: 3
  commits: 3
patterns-established:
  - "Regras puras (dinheiro, mes, mensagens) testadas antes da implementacao (RED/GREEN)."
requirements-completed: []
coverage:
  - id: D1
    description: "Regras puras de cupom, desconto em centavos, mes de Sao Paulo, situacao derivada, opt-out, mascara, contraste, link do Google e validacao de textos/config"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts#pesquisa-regras (57 testes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PesquisaConfigService cria o singleton no primeiro acesso com ativo false, textos preenchidos e padroes por env"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts#PesquisaConfigService (5 testes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Resposta emite um cupom com snapshot, intervalo de 90 dias, teto mensal e cancelamento na corrida de revogacao, sem nunca derrubar a nota"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa.service.test.ts#PesquisaService - recompensa (19 testes)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bloco do fechamento usa textoSemRecompensa quando teto ou intervalo impedem a recompensa, e textoFechamento resolvido quando disponivel"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa.service.test.ts#teto: fechamento sem/com recompensa"
        status: pass
    human_judgment: false
---

# Phase 52 Plan 03: Regras puras e emissao do cupom Summary

**Regras puras de cupom, dinheiro e mensagens com config singleton por empresa e emissao do cupom na resposta, respeitando intervalo por telefone e teto mensal sem nunca derrubar a nota.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-11-22T15:18:00-03:00
- **Completed:** 2026-11-22T15:25:34-03:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `pesquisa-regras.ts` ganhou codigo de cupom (`crypto.randomInt`, alfabeto sem ambiguos), dinheiro em centavos inteiros com arredondamento para baixo, janela do mes em America/Sao_Paulo, situacao derivada do cupom, opt-out normalizado, mascara de telefone, contraste WCAG, allowlist do link do Google, validacao de mensagens e de config e `montarConfigPadrao` por env — 57 testes.
- `PesquisaConfigService` cria o singleton id `default` no primeiro acesso com `ativo: false`, todos os textos preenchidos e os padroes da empresa vindos das envs (D-24/D-26/D-42).
- `PesquisaService` passou a ler a config pelo singleton, calcula o gasto do mes, avalia a elegibilidade (teto mensal e intervalo por telefone), emite o cupom com snapshot/retry/idempotencia e cancela o cupom quando a revogacao corre no meio (T-52-69); o fechamento troca para o texto sem promessa quando nao ha recompensa.
- Tracer do plano 52-01 continua verde com o 5o argumento do construtor e o teste de kill-switch agora confirma a criacao da linha padrao com `ativo: false`.

## Task Commits

1. **Task 1: Regras puras completas com testes** - `b5a6394` (feat)
2. **Task 2: PesquisaConfigService singleton** - `fb8e27a` (feat)
3. **Task 3: Emissao de cupom, elegibilidade e fechamento** - `eea7596` (feat)

_Nota: cada task foi escrita em TDD (teste vermelho, implementacao, verde) e commitada uma vez com teste + codigo._

## Files Created/Modified

- `apps/backend/src/modules/pesquisa/pesquisa-regras.ts` - regras puras do plano 52-03 somadas as do tracer
- `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts` - 57 testes das regras puras
- `apps/backend/src/modules/pesquisa/pesquisa-config.service.ts` - singleton da configuracao
- `apps/backend/src/modules/pesquisa/pesquisa-config.service.test.ts` - 5 testes do singleton
- `apps/backend/src/modules/pesquisa/pesquisa.service.ts` - gasto do mes, elegibilidade, emissao e cor acessivel
- `apps/backend/src/modules/pesquisa/pesquisa.service.test.ts` - 19 testes da recompensa
- `apps/backend/src/modules/pesquisa/pesquisa.module.ts` - registra e exporta `PesquisaConfigService`
- `apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts` - 5o argumento, fake de cupom e kill-switch atualizado

## Decisions Made

- `notaValida` virou regra pura e o `responder` passou a usa-la, para a faixa 1 a 5 ter uma unica fonte testada.
- `emitirCupom` consulta `cupomRecompensa.findUnique({ pesquisaId })` antes de avaliar elegibilidade; sem isso o proprio cupom da pesquisa seria contado pela regra de intervalo e a idempotencia nunca devolveria o cupom existente.
- Mensagens de validacao do convite do Google (nao literalmente no UI-SPEC): "O convite do Google nao pode falar de cupom." e "Inclua {link_google} para o convite do Google.".
- Textos padrao das quatro mensagens de WhatsApp redigidos conforme as restricoes do plano (fechamento promete {percentual}/{teto}/{compra_minima} e termina em "Nao quer receber? Responda SAIR."; sem recompensa nao promete; pos-resposta sem link; convite sem cupom).
- No tracer, `cupomRecompensa.create` falha de proposito para manter `cupom: null` e exercitar o best-effort sem duplicar a suite de cupom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `notaValida` como regra pura**
- **Found during:** Task 1 (regras puras)
- **Issue:** o bloco behavior exige testes de "nota" na suite de regras puras, mas nao existia funcao pura para isso (a checagem estava inline no `responder`).
- **Fix:** `notaValida` exportada em `pesquisa-regras.ts` e usada pelo `responder`.
- **Files modified:** `apps/backend/src/modules/pesquisa/pesquisa-regras.ts`, `apps/backend/src/modules/pesquisa/pesquisa.service.ts`
- **Verification:** testes "nota: aceita apenas inteiros de 1 a 5" e DTO do tracer.
- **Committed in:** `b5a6394` e `eea7596` (parte das tasks)

---

**Total deviations:** 1 auto-fix (Rule 2)
**Impact on plan:** sem mudanca de escopo; a regra de nota passou a ter fonte unica testada.

## Issues Encountered

- O worktree nao tem `node_modules` proprio; jest/tsc foram executados com o binario do checkout principal (`/root/SistemaOrcamento/node_modules/.bin/...`), sem tocar no repositorio principal.
- O fake de Prisma do tracer precisou de `pesquisaConfig.create` e de um delegate `cupomRecompensa` para o novo construtor de 5 argumentos nao quebrar os 18 testes do plano 52-01.

## User Setup Required

None - no external service configuration required. As envs `PESQUISA_*_PADRAO` sao opcionais (padroes do codigo cobrem o primeiro acesso); os valores por empresa entram no compose do plano 52-11.

## Next Phase Readiness

- 52-05 pode usar `TEXTOS_PADRAO`/`renderizarTexto`, `gastoDoMesCentavos`, `emitirCupom` e o cupom retornado em `RespostaPublica`.
- 52-07 pode reaproveitar `validarConfig`, `ConfigEntrada`, `PesquisaConfigService` e o tipo `PesquisaConfigView` para a tela e o DTO.
- 52-12 tem o caminho de revogacao ja coberto pela releitura de `revogadaEm` em `emitirCupom`.

## Self-Check: PASSED

- `apps/backend/src/modules/pesquisa/pesquisa-regras.ts`, `pesquisa-regras.test.ts`, `pesquisa-config.service.ts`, `pesquisa-config.service.test.ts`, `pesquisa.service.ts`, `pesquisa.service.test.ts`, `pesquisa.module.ts`, `pesquisa.tracer.test.ts` existem no disco e nos commits `b5a6394`, `fb8e27a` e `eea7596`.
- `jest modules/pesquisa modules/integrations/chatwoot`: 10 suites, 252 testes verdes.
- `tsc --noEmit -p apps/backend/tsconfig.json`: sem erros.

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*
