---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 12
subsystem: pesquisa-satisfacao
tags: [nestjs, controller, admin, revogacao, cupom, prisma, class-validator, tdd]
status: complete

requires:
  - phase: 52-01
    provides: PesquisaService.obterPublica/responder com revogadaEm e o corpo generico INDISPONIVEL
  - phase: 52-04
    provides: ChatwootService (cliente) usado pelos servicos da fase
  - phase: 52-05
    provides: agendamento do convite em memoria com a chave convite:<id> (agendarEnvioFechamento)
  - phase: 52-07
    provides: PesquisaConfigService, PesquisaCupomService, PesquisaResultadosService e o AtualizarPesquisaConfigDto
provides:
  - PesquisaRevogacaoService.revogar + tipo ResultadoRevogacao (revogadaEm, cupom EMITIDO -> CANCELADO, convite cancelado, idempotente)
  - PesquisaAdminController (pesquisa/admin) com 7 rotas todas em AdminOnly
  - RespostaConfigAdmin (config, padroes, limites, placeholders, hostsGoogle, atualizadoEm)
  - ResgatarCupomDto e ListarCuponsQueryDto
  - PesquisaModule com PesquisaAdminController e PesquisaRevogacaoService
affects:
  - 52-08 (tela de configuracao consome GET/PUT config)
  - 52-09 (painel de resultados, cupons e a acao de revogar)
  - 52-10 (tela de cupons e resgate)
  - 52-11 (roteiro usa as rotas admin)

actuals:
  tokens: 12300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - revogacao definitiva por coluna revogadaEm (token preservado para auditoria), idempotente via updateMany condicionado a revogadaEm nulo
    - UNICO escritor de CANCELLED do cupom: updateMany condicionado ao status EMITIDO (USADO/EXPIRADO intocados)
    - guarda de id validado por regex UUID antes de qualquer acesso ao banco
    - controller admin com AdminOnly por handler e resposta montada fora dos servicos (sem telefone/token)

key-files:
  created:
    - apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa-admin.controller.ts
    - apps/backend/src/modules/pesquisa/pesquisa-admin.controller.test.ts
    - apps/backend/src/modules/pesquisa/dto/resgatar-cupom.dto.ts
    - apps/backend/src/modules/pesquisa/dto/listar-cupons.query.dto.ts
  modified:
    - apps/backend/src/modules/pesquisa/pesquisa.module.ts

key-decisions:
  - "revogar sempre chama o updateMany com where revogadaEm: null; contagem 0 vira jaRevogada (idempotente e nunca sobrescreve a data original)"
  - "cupomJaUsado vem do snapshot lido antes do updateMany; o cancelamento so alcanca status EMITIDO"
  - "o convite do Google agendado em memoria e cancelado pela chave convite:<id> (mesma chave do plano 52-05), sem depender do timer"
  - "o controller nao depende do cliente do Chatwoot: criacao de etiquetas e passo manual do roteiro (D-33)"
  - "GET/PUT config devolvem padroes, limites fixos do UI-D15, placeholders e hosts do Google, com atualizadoEm em ISO ou nulo"

patterns-established:
  - "Acao admin destrutiva: regex de id antes do banco, transacao com updateMany condicionado e log so com o id e os flags."
  - "Controller admin fino: validacao fina no servico/DTO e montagem de resposta num helper unico."

requirements-completed: []

coverage:
  - id: D1
    description: "Revogar pesquisa: grava revogadaEm, cancela o cupom EMITIDO, cancela o convite agendado, e idempotente e responde 404 para id invalido/inexistente"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.test.ts#13 testes (updateMany, idempotencia, UUID, convite, logs)"
        status: pass
      - kind: integration
        ref: "apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.test.ts#publica/INDISPONIVEL e corrida revogar x responder com PesquisaService real"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rotas admin de config (GET/PUT), resultados, cupons, detalhe, resgate e revogar, todas em AdminOnly com DTOs validados"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-admin.controller.test.ts#20 testes (guardas, rotas, respostas, DTOs)"
        status: pass
    human_judgment: false
  - id: D3
    description: "PesquisaModule registra o PesquisaAdminController e o PesquisaRevogacaoService"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa.module.ts + suite completa src/modules/pesquisa (10 suites, 233 testes)"
        status: pass
    human_judgment: false

metrics:
  duration: "~4min"
  started: "2026-11-22T18:41:28Z"
  completed: "2026-11-22T18:45:30Z"
  tasks: 2
  files: 7
  commits: 2
  plan_head_before: 18fb3f53b2f5cc21dd54a94ee8a0218e4ac2162d
  plan_head_after: a00055e
---

# Phase 52 Plan 12: API administrativa da pesquisa e revogação do link

**Revogação definitiva da pesquisa (link vira INDISPONIVEL com corpo genérico, cupom disponível cancelado, convite agendado cancelado) e o controller admin com as 7 rotas que as telas da fase consomem, tudo atrás de AdminOnly.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-11-22T18:41:28Z
- **Completed:** 2026-11-22T18:45:30Z
- **Tasks:** 2
- **Files modified:** 7 (6 criados, 1 modificado)
- **Verificação:** `jest src/modules/pesquisa` = 10 suites / 233 testes verdes; `tsc --noEmit -p apps/backend/tsconfig.json` sem erros.

## Accomplishments

- `PesquisaRevogacaoService.revogar` valida o id como UUID antes do banco, grava `revogadaEm` só se ainda não revogada (idempotente, contagem 0 → `jaRevogada`), cancela apenas o cupom ainda `EMITIDO` (único escritor de `CANCELADO`; `USADO`/`EXPIRADO` intocados), devolve `{ pesquisaId, jaRevogada, cupomCancelado, cupomJaUsado }` e cancela o convite agendado com `cancelarEnvioFechamento("convite:<id>")`.
- Prova ponta a ponta com o `PesquisaService` real sobre Prisma em memória: depois de revogar, `obterPublica(token)` devolve exatamente `{ estado: "INDISPONIVEL" }` (idêntico a um token inexistente) e `responder` devolve `INDISPONIVEL` sem gravar nota — para pesquisa aberta e para já respondida.
- Corrida revogar × responder coberta nos dois sentidos (revogação antes da inserção do cupom e depois dela): o cupom sempre termina `CANCELADO` e `responder` responde OK com `cupom: null`.
- `PesquisaAdminController` em `pesquisa/admin` com `@AdminOnly()` nos 7 handlers: `GET/PUT config`, `GET resultados` (mes padrão, 30d/tudo, inválido → 400), `GET cupons` (status/cursor/limite), `GET cupons/:codigo` (404), `POST cupons/:codigo/resgate` (200) e `POST pesquisas/:id/revogar` (200).
- `RespostaConfigAdmin` expõe config sem `atualizadoEm`/`atualizadoPor` misturados, `padroes` da empresa, `limites` do UI-D15, `PLACEHOLDERS_VALIDOS`, `HOSTS_GOOGLE` e `atualizadoEm` em ISO ou nulo.
- DTOs `ResgatarCupomDto` (valor positivo, 2 casas, teto 1.000.000) e `ListarCuponsQueryDto` (lista fechada de status, cursor ≤64, limite 1–100) validados com class-validator.
- `PesquisaModule` registra e exporta `PesquisaRevogacaoService` e adiciona `PesquisaAdminController` aos controllers.

## Task Commits

Cada task foi escrita em TDD (teste vermelho, implementação, verde) e commitada atomicamente:

1. **Task 1: Revogar pesquisa — invalida o link, cancela o cupom disponível e o convite agendado** - `aa5ffdc` (feat)
2. **Task 2: PesquisaAdminController — config, resultados, cupons, resgate e revogar** - `a00055e` (feat)

**Plan metadata:** commit do SUMMARY (docs).

## Files Created/Modified

- `apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.ts` - `revogar` transacional, idempotente, com log só do pesquisaId e flags.
- `apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.test.ts` - 13 testes (updateMany, idempotência, UUID, convite, logs, ponta a ponta publica/INDISPONIVEL e corrida).
- `apps/backend/src/modules/pesquisa/pesquisa-admin.controller.ts` - 7 rotas admin + `RespostaConfigAdmin` e limites.
- `apps/backend/src/modules/pesquisa/pesquisa-admin.controller.test.ts` - 20 testes (guardas por metadata, rotas, respostas, DTOs, sem etiquetas, sem telefone).
- `apps/backend/src/modules/pesquisa/dto/resgatar-cupom.dto.ts` - `valorCompra` positivo com 2 casas.
- `apps/backend/src/modules/pesquisa/dto/listar-cupons.query.dto.ts` - status fechado, cursor e limite 1–100.
- `apps/backend/src/modules/pesquisa/pesquisa.module.ts` - registra/exporta o serviço de revogação e o controller admin.

## Decisions Made

- `revogar` sempre executa o `updateMany` com `where: { revogadaEm: null }`; contagem 0 vira `jaRevogada`, o que cobre o segundo clique sem sobrescrever a data original.
- `cupomJaUsado` usa o snapshot lido antes do `updateMany`; o cancelamento alcança só `EMITIDO`, mantendo `USADO` e `EXPIRADO` intactos.
- O convite em memória é cancelado pela mesma chave `convite:<id>` do plano 52-05; o disparo ainda re-checa `revogadaEm`, então nenhuma ordem deixa convite sair.
- O controller não injeta o cliente do Chatwoot (D-33): criação de etiquetas é passo manual do roteiro.
- `limites` são fixos (UI-D15) e o 400 do `PUT config` propaga intacto `{ message, campos }` do `PesquisaConfigService`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- O worktree não tem `node_modules` próprio: jest e tsc foram executados a partir de `/root/SistemaOrcamento/node_modules` (a resolução de módulos sobe até a raiz do monorepo), mesma abordagem dos planos 52-05 e 52-07. Nenhuma alteração de código foi necessária.
- A linha de acceptance do `AdminOnly` trazia `-ge 8` e a anotação `EXPECT>=9`; o arquivo entrega 9 linhas (import + 7 decoradores + o JSDoc que documenta a exigência), satisfazendo as duas leituras.

## Known Stubs

Nenhum. As rotas, a revogação e os DTOs estão completos e testados; não há placeholder, valor vazio hardcoded que chegue à tela nem TODO/FIXME.

## Threat Flags

Nenhum além do `threat_model` do plano. T-52-30 mitigado (AdminOnly nos 7 handlers, provado por metadata e ausência de rota pública); T-52-32 mitigado (DTOs com faixas/listas fechadas e id da revogação validado como UUID antes do banco); T-52-60 mitigado (ação por pesquisa, idempotente, nunca apaga e só loga o pesquisaId). Nenhuma resposta expõe telefone completo, token ou conversationId.

## Next Phase Readiness

- Pronto para as telas dos planos 52-08 (config), 52-09 (painel/cupons/revogar) e 52-10 (cupons/resgate) consumirem `/api/pesquisa/admin/*` via proxies do Next.
- Pronto para o roteiro (52-11) exercitar as rotas com `curl` e token de administrador digitado na hora.
- Nenhum endpoint público foi criado neste plano; a revogação é definitiva (sem "desfazer" nesta fase).

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED

- Arquivos criados/modificados existem no disco e nos commits `aa5ffdc` e `a00055e` (ancestrais de HEAD).
- `git rev-list --count 18fb3f5..HEAD` = 2 (uma por task).
- `jest src/modules/pesquisa`: 10 suites, 233 testes verdes.
- `tsc --noEmit -p apps/backend/tsconfig.json`: sem erros.
