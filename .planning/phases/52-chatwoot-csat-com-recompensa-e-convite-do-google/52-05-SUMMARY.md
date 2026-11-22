---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 05
subsystem: pesquisa-satisfacao
tags: [chatwoot, whatsapp, cupom, convite-google, re-tentativa, reserva, prisma, nestjs]
status: complete

requires:
  - phase: 52-01
    provides: PesquisaService, schema PesquisaSatisfacao/CupomRecompensa/PesquisaSupressao, input_csat privada e PUT do CSAT nativo
  - phase: 52-03
    provides: PesquisaConfigService, pesquisa-regras (formatadores/renderizarTexto) e emitirCupom com snapshot
  - phase: 52-04
    provides: listMessagesAfter (com incluirInternas), updateContactCustomAttributes, ETIQUETAS_PESQUISA e a fila por conversa/agendador
provides:
  - pesquisa-efeitos com etiquetasDaPesquisa, dataISOSaoPaulo, montarNotaPrivada, montarAtributosContato e montarVariaveisMensagem
  - PesquisaService.aplicarEfeitosChatwoot (PUT nativo, nota privada, atributos e etiquetas, cada um isolado)
  - Envio do cupom por WhatsApp na hora e do convite do Google com atraso humano de 60 a 180 s
  - reservarEnvio, mensagemJaEnviada e csatNativoLigado (reserva e conferencia antes de reenviar)
  - reenviarPendentes (cupom, convite e CSAT nativo com limites) e marcarCuponsExpirados
  - Constantes ATRASO_CONVITE_MIN_S/MAX_S, IDADE_MINIMA/MAXIMA_REENVIO_MS, MAX_TENTATIVAS_ENVIO, LIMITE_CSAT_NATIVO_MS e IDADE_RESERVA_VELHA_MS
affects:
  - 52-06 (job de re-tentativa e housekeeping usa reenviarPendentes e marcarCuponsExpirados)
  - 52-12 (revogacao: NAO_APLICAVEL nos envios e exclusao na re-tentativa)

actuals:
  tokens: 23309
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - efeito em segundo plano que nunca bloqueia a resposta HTTP e nunca lanca (cada passo no proprio try/catch)
    - reserva por updateMany condicionado com contagem 1 antes de qualquer envio externo
    - resultado incerto (erro sem resposta HTTP) fica ENVIANDO e so e reenviado depois de conferir no Chatwoot
    - re-tentativa com copy local da linha apenas para decidir o canal (o envio rele a linha do banco)

key-files:
  created:
    - apps/backend/src/modules/pesquisa/pesquisa-efeitos.ts
    - apps/backend/src/modules/pesquisa/pesquisa-efeitos.test.ts
    - apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts
  modified:
    - apps/backend/src/modules/pesquisa/pesquisa.service.ts
    - apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts

key-decisions:
  - "Efeitos, cupom e agendamento do convite rodam no mesmo dispararEfeito, depois do cupom emitido; a resposta HTTP nunca espera por eles (D-10)."
  - "O envio do cupom rele a linha do cupom no banco (status EMITIDO e reserva) em vez de receber o cupom publico de emitirCupom; mantem emitirCupom intacto e o caminho de re-tentativa identico ao primeiro envio."
  - "reservarEnvio centraliza o updateMany condicionado (PENDENTE/FALHA -> ENVIANDO e, na re-tentativa, ENVIANDO velho com mais de 15 min)."
  - "reenviarPendentes seleciona por respondidaEm (5 min a 3 dias), tentativasEnvio < 6 e revogadaEm nulo, e decide as pendencias por canal em memoria (cupom lido por pesquisaId)."
  - "csatNativoLigado devolve null quando nao da para ler a inbox; a re-tentativa segue criando a mensagem (warn), como o plano pede."
  - "tentativasEnvio e incrementado com valor calculado (pesquisa.tentativasEnvio + 1) e um unico flag por pesquisa por ciclo."

patterns-established:
  - "Reserva-before-send: updateMany condicionado decide quem envia (T-52-67), inclusive contra dois ciclos simultaneos."
  - "Confirmacao no Chatwoot antes de reenviar envio incerto; lista indisponivel prefere nao duplicar."
  - "Releitura da config e da supressao no momento do disparo, nunca no agendamento."

requirements-completed: []

coverage:
  - id: D1
    description: "Efeitos da resposta no Chatwoot: PUT do CSAT nativo quando a input_csat existe, nota privada, atributos do contato e etiquetas avaliou/csat-baixo pela fila por conversa, todos best-effort"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-efeitos.test.ts e pesquisa-mensagens.test.ts (Task 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cupom por WhatsApp na hora e convite do Google separado, com atraso humano, sem vinculo entre eles e sem mensagem a quem pediu SAIR"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts#cupom/convite/supressao"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reserva antes de enviar, conferencia no Chatwoot de envio incerto e re-tentativa com limites (idade, tentativas e janela do CSAT)"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts#reenvio/reserva"
        status: pass
    human_judgment: false
  - id: D4
    description: "CSAT nativo sem duplicar a input_csat e sem criar nada com o CSAT nativo ligado na inbox"
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts#reenvio CSAT"
        status: pass
    human_judgment: false

metrics:
  duration: "~35min"
  completed: 2026-11-22
  commits: 2
  plan_head_before: 246bda28c7a4bf56e7d3a4b36cdb2a6cd5ec4612
  plan_head_after: acacc99e96635db8930c31d1bebd144755ba3c56
---

# Phase 52 Plan 05: Efeitos no Chatwoot, cupom e convite por WhatsApp e re-tentativa Summary

**Depois da resposta, o Chatwoot recebe nota privada, atributos e etiquetas, o cliente recebe o cupom na hora e o convite do Google separado por atraso humano, e todo envio e reservado e re-tentado com limites e sem duplicar.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 5 (3 criados, 2 modificados)
- **Verificacao:** `jest src/modules/pesquisa src/modules/integrations/chatwoot` = 12 suites / 309 testes verdes; `tsc --noEmit -p apps/backend/tsconfig.json` sem erros.

## Accomplishments

- `pesquisa-efeitos.ts` (puro, 16 testes): `etiquetasDaPesquisa` (1-2 ganham `csat-baixo`, 3-5 nao), `dataISOSaoPaulo` (en-CA em America/Sao_Paulo), `montarNotaPrivada` (nota, variante, comentario e cupom ou "nenhum cupom foi emitido"), `montarAtributosContato` (`ultima_nota_csat`, `data_ultima_avaliacao`, `cupom_ativo`, `cupom_validade`) e `montarVariaveisMensagem`.
- `PesquisaService.aplicarEfeitosChatwoot` substitui o efeito simplificado do tracer: cada passo (PUT nativo, nota privada, atributos com `contactId` e etiquetas pela fila por conversa) tem o proprio `try/catch` com `logger.warn` de `pesquisaId` e motivo; pesquisa anonimizada nao recebe nada. D-28: so `MENSAGEM_OK` envia o PUT na resposta; `AGUARDANDO_MENSAGEM`/`MENSAGEM_FALHA` ficam para a re-tentativa.
- Envio do cupom na hora (texto `textoPosResposta`, sem link) e convite do Google agendado entre 60 e 180 s, renderizado so com `link_google` e `nome_empresa`, nunca com o codigo do cupom (T-52-25/D-22).
- `reservarEnvio` faz o `updateMany` condicionado (PENDENTE/FALHA -> ENVIANDO com carimbo; ENVIANDO velho so na re-tentativa) e a contagem 1 e o unico gate do `sendOutgoingMessage` (T-52-67). Erro HTTP ou `enabled` falso viram FALHA; erro sem resposta fica ENVIANDO e e conferido no Chatwoot (20 mensagens mais recentes, mesmo texto normalizado) antes de reenviar; lista indisponivel nao reenvia.
- `reenviarPendentes` cobre cupom, convite e CSAT nativo: janela de `respondidaEm` de 5 min a 3 dias, `tentativasEnvio` < 6, janela de 14 dias do CSAT, revogada/anonimizada fora, incremento unico por pesquisa por ciclo e contagens `{ candidatos, cupons, convites, csat, falhas }`.
- CSAT nativo reconciliado: le conversa e inbox (nativo ligado -> NAO_APLICAVEL com warn do id da inbox), lista mensagens com `incluirInternas` e reutiliza a `input_csat` existente; `RESPOSTA_FALHA` so repete o PUT; criacao falhando mantem `MENSAGEM_FALHA`.
- `marcarCuponsExpirados` (EMITIDO vencido -> EXPIRADO) e `onModuleDestroy` cancelando os convites agendados.

## Task Commits

Cada task foi escrita em TDD (teste vermelho, implementacao, verde) e commitada atomicamente:

1. **Task 1: Efeitos da resposta no Chatwoot** - `9025b6e` (feat)
2. **Task 2: Mensagens de WhatsApp, supressao e re-tentativa** - `acacc99` (feat)

**Plan metadata:** este arquivo (commitado separadamente).

## Files Created/Modified

- `apps/backend/src/modules/pesquisa/pesquisa-efeitos.ts` - funcoes puras dos efeitos e das variaveis das mensagens
- `apps/backend/src/modules/pesquisa/pesquisa-efeitos.test.ts` - 16 testes puros (etiquetas, data, nota privada, atributos e variaveis)
- `apps/backend/src/modules/pesquisa/pesquisa-mensagens.test.ts` - 41 testes de efeitos, envios, supressao, reserva, reenvio, expiracao e shutdown
- `apps/backend/src/modules/pesquisa/pesquisa.service.ts` - efeitos no Chatwoot, envio do cupom/convite, reserva, re-tentativa, expiracao e shutdown
- `apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts` - assercoes de PUT passam a contar apenas o `csat_survey`

## Decisions Made

- Os tres passos pos-resposta rodam no mesmo `dispararEfeito`: efeitos do Chatwoot, cupom e agendamento do convite. A promessa e rastreada por `aguardarEfeitos`, o que tambem deixa o timer do convite testavel sem esperar tempo real.
- `enviarCupomWhatsApp` rele a linha do cupom (`status`, `envioCupomStatus`, `envioCupomReservadoEm`) em vez de confiar no cupom publico de `emitirCupom`; o mesmo caminho serve a primeira tentativa e a re-tentativa, e `emitirCupom` ficou intocado.
- `reenviarPendentes` seleciona as pesquisas com uma consulta unica (janela, revogada e tentativas) e resolve as pendencias por canal em memoria, lendo o cupom por `pesquisaId`; evita filtro de relacao no Prisma e mantem o fake dos testes simples.
- `enviarComReserva` concentra a confirmacao de envio incerto; a reserva e chamada explicitamente por canal, no mesmo padrao do plano.
- `csatNativoLigado` devolve `null` quando a inbox nao pode ser lida e a re-tentativa segue criando a mensagem (warn), como o plano manda ("leitura da inbox falhando -> segue").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Atualizacao do `pesquisa.tracer.test.ts` para os PUTs do contato**
- **Found during:** Task 1 (efeitos)
- **Issue:** o tracer do plano 52-01 contava `axiosMock.put` globalmente; com os atributos do contato (tambem PUT) as assercoes de "1 PUT" e "nenhum PUT" quebraram.
- **Fix:** helper `putsCsat()` que filtra a URL `/csat_survey/`; as quatro assercoes passaram a usar o filtro (nenhuma assercao de comportamento foi removida).
- **Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts`
- **Verification:** suite completa do tracer verde (12 testes).
- **Committed in:** `9025b6e`

**2. [Rule 2 - Missing Critical] Supressao checada tambem no agendamento do convite**
- **Found during:** Task 2 (mensagens)
- **Issue:** o plano pedia a checagem no momento do envio; sem a checagem no agendamento o telefone ja suprimido na hora da resposta ficava com `envioConviteStatus = PENDENTE` (o comportamento exigido e `NAO_APLICAVEL`).
- **Fix:** `agendarConviteGoogle` consulta `pesquisaSupressao` antes de criar o timer (a checagem se repete no disparo, D-49).
- **Files modified:** `apps/backend/src/modules/pesquisa/pesquisa.service.ts`
- **Verification:** testes "supressao: telefone no opt-out..." e "telefone que entra no opt-out entre a resposta e o convite...".
- **Committed in:** `acacc99`

---

**Total deviations:** 1 auto-fix Rule 3 (teste) e 1 auto-fix Rule 2 (supressao)
**Impact on plan:** nenhum desvio de escopo; a supressao ficou mais estrita e o tracer passou a medir so o CSAT nativo.

## Issues Encountered

- O worktree nao tem `node_modules` proprio; `jest` e `tsc` rodaram do checkout principal (`/root/SistemaOrcamento/node_modules/.bin`), que e ancestral do worktree (mesma abordagem dos planos 52-01 e 52-04).
- O fake de Prisma precisou de um matcher com `OR`, `in`, `not` e os quatro comparadores aplicados em conjunto (`gte` + `lt` na mesma condicao); a primeira versao parava no primeiro operador encontrado.

## Known Stubs

Nenhum. Os efeitos, envios e a re-tentativa estao completos e testados; nao ha placeholder, valor vazio hardcoded que chegue a tela nem TODO/FIXME.

## Threat Flags

Nenhum alem do `threat_model` do plano. As mensagens ao cliente ficam no limite ja previsto (Backend -> Chatwoot -> Evolution): dois envios separados, um link por mensagem, opt-out relido no disparo e logs sem telefone, token ou codigo de cupom.

## Next Phase Readiness

- 52-06 pode chamar `reenviarPendentes()` e `marcarCuponsExpirados()` do job e usar as constantes exportadas para as guardas de ciclo.
- 52-12 tem os caminhos de revogacao cobertos: envios gravam `NAO_APLICAVEL`, a re-tentativa exclui `revogadaEm` preenchida e o timer do convite respeita a revogacao mesmo sem cancelamento.
- A suite da fase 51 e do plano 52-04 permanece verde (nenhum teste removido).

## Self-Check: PASSED

- Arquivos criados/modificados existem no disco e nos commits `9025b6e` e `acacc99` (ancestrais de HEAD).
- `git rev-list --count 246bda2..HEAD` = 2 (uma por task).
- `jest src/modules/pesquisa src/modules/integrations/chatwoot`: 12 suites, 309 testes verdes.
- `tsc --noEmit -p apps/backend/tsconfig.json`: sem erros.

---
*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*
