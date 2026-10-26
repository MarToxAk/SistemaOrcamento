---
phase: quick-260906-iz0
plan: 01
subsystem: api
tags: [nestjs, prisma, nfse, quotes]

requires:
  - phase: quick-260906-i7c
    provides: resolverTomadorQuote com diagnostico e endereco editavel na emissao de NFS-e
provides:
  - "quote-identifier.util.ts: buildQuoteIdentifierWhereCandidates, QuotePrismaDelegate, findQuoteByIdentifierBasic — fonte unica da ordem externalQuoteId -> internalNumber -> id"
  - "NfseService resolvendo orcamento nas 5 rotas de /quotes/:quoteId/nfse/* por internalNumber, externalQuoteId ou UUID (antes so UUID)"
  - "QuotesService.findQuoteByIdentifier refatorado para consumir o util compartilhado (zero duplicacao)"
affects: [nfse, quotes, contas-a-pagar]

actuals:
  tokens: 7500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Util puro sem DI para logica compartilhada entre services (mesmo padrao de athos-fk.util.ts)"

key-files:
  created:
    - apps/backend/src/modules/quotes/quote-identifier.util.ts
    - apps/backend/src/modules/quotes/quote-identifier.util.test.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.identificador.test.ts
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/quotes/quotes.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts

key-decisions:
  - "Util puro (sem DI, sem NestJS decorators) em vez de injetar QuotesService no NfseService — evita mais um ciclo de forwardRef entre QuotesModule/AthosModule/ChatwootModule/NfseModule e nao carrega relacoes pesadas que o NfseService nao usa"
  - "externalQuoteId construido via BigInt(identifier) direto da string, nunca via Number — evita perda de precisao em numeros acima de Number.MAX_SAFE_INTEGER que poderia casar orcamento errado (T-iz0-02)"
  - "QUOTE_DETAIL_INCLUDE extraida como constante de modulo em quotes.service.ts para eliminar o bloco include repetido 3x no findQuoteByIdentifier, sem mudar assinatura nem contagem de chamadas por ramo"

patterns-established:
  - "Resolucao de identificador de orcamento (numero Athos / numero interno / UUID) agora vive em UM unico arquivo, consumido por qualquer service que precise resolver /quotes/:id vindos de rota"

requirements-completed: [QUICK-260906-iz0]

coverage:
  - id: D1
    description: "buildQuoteIdentifierWhereCandidates devolve a ordem correta de candidatos (numerico com 2 candidatos, UUID com 1, overflow so externalQuoteId)"
    requirement: QUICK-260906-iz0
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/quotes/quote-identifier.util.test.ts#Teste A-C"
        status: pass
    human_judgment: false
  - id: D2
    description: "findQuoteByIdentifierBasic itera candidatos e devolve o primeiro registro ou null"
    requirement: QUICK-260906-iz0
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/quotes/quote-identifier.util.test.ts#Teste D-E"
        status: pass
    human_judgment: false
  - id: D3
    description: "emitirQuoteNfseAutomatica resolve identificador numerico sem 404, grava com o UUID resolvido e usa o prefixo MinIO correto"
    requirement: QUICK-260906-iz0
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.identificador.test.ts#Teste F-H"
        status: pass
    human_judgment: false
  - id: D4
    description: "resolverTomadorQuote e removerQuoteNfse tambem resolvem por internalNumber/externalQuoteId (os 4 pontos restantes)"
    requirement: QUICK-260906-iz0
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.identificador.test.ts#Teste I-J"
        status: pass
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts (12 testes) + nfse.service.chatwoot.test.ts (4 testes)"
        status: pass
    human_judgment: false
  - id: D5
    description: "QuotesService.findQuoteByIdentifier consome o util compartilhado sem regressao de comportamento (mesmo include, mesma contagem de chamadas)"
    requirement: QUICK-260906-iz0
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/quotes/*.test.ts (suite de quotes completa)"
        status: pass
      - kind: unit
        ref: "npm --prefix apps/backend run test (443/443 regressao completa)"
        status: pass
    human_judgment: false
  - id: D6
    description: "As 5 rotas de /quotes/:quoteId/nfse/* funcionam ponta-a-ponta contra o Postgres/Prisma real (emitir, tomador, pdf, anexar/remover) usando internalNumber, ex. /orcamento/22764"
    human_judgment: true
    rationale: "Requer npm run dev + banco Postgres de dev rodando nesta maquina (fora do ambiente de execucao do agente); e o human-check executavel descrito no PLAN.md e ainda pendente."

duration: ~30min
completed: 2026-09-06
status: complete
---

# Quick Task 260906-iz0: Corrigir 404 "Orcamento nao encontrado" no fluxo de NFS-e do orcamento Summary

**Novo util compartilhado quote-identifier.util.ts (fonte unica da ordem externalQuoteId -> internalNumber -> id) elimina o 404 nas 5 rotas de `/quotes/:quoteId/nfse/*`, que antes so aceitavam UUID, e substitui a logica duplicada 3x dentro de QuotesService.findQuoteByIdentifier.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-06
- **Tasks:** 2
- **Files modified:** 7 (3 criados, 4 modificados)

## Accomplishments

- `NfseService` (5 metodos: `emitirQuoteNfseAutomatica`, `resolverTomadorQuote`, `baixarDanfsePdf`, `anexarQuoteNfse`, `removerQuoteNfse`) agora resolve o orcamento por `internalNumber`, `externalQuoteId` OU UUID — os mesmos tres identificadores que `GET /quotes/:id` ja aceitava. Antes, so aceitava UUID e sempre lancava 404 quando a rota recebia o numero amigavel (`/orcamento/22764`), que era exatamente o que o frontend enviava.
- Toda escrita (`prisma.quote.update`) e todo prefixo de objeto MinIO passam a usar o UUID canonico `quote.id` resolvido, nunca mais o identificador cru vindo da rota.
- Mitigacao de precisao (T-iz0-02): o candidato de `externalQuoteId` e construido com `BigInt` direto da string do identificador, nunca convertendo por `Number` primeiro — um identificador acima de `Number.MAX_SAFE_INTEGER` nao pode mais casar (por perda de precisao) com o orcamento errado.
- `QuotesService.findQuoteByIdentifier` — que ja continha a ordem de resolucao correta, repetida 3x com o mesmo bloco `include` — foi refatorado para consumir `buildQuoteIdentifierWhereCandidates`, com o `include` extraido para a constante `QUOTE_DETAIL_INCLUDE`. Zero duplicacao remanescente entre os dois services.
- 10 testes novos (A-J) cobrindo o util e a regressao do 404; 16 testes preexistentes de `nfse.service.tomador.test.ts`/`nfse.service.chatwoot.test.ts` ajustados (duplo de `findUnique` para `findFirst`) sem mudar nenhuma assercao de comportamento.

## Task Commits

Cada task foi commitada atomicamente (TDD: RED antes, GREEN depois, na mesma task):

1. **Task 1: Util compartilhado de resolucao + caminho de emissao ponta-a-ponta** - `a7cfdb6` (fix)
2. **Task 2: Aplicar o resolver aos 4 pontos restantes e eliminar a duplicacao em QuotesService** - `cdff771` (fix)

_Metadados de documentacao (SUMMARY/STATE/ROADMAP) commitados separadamente pelo orquestrador._

## Files Created/Modified

- `apps/backend/src/modules/quotes/quote-identifier.util.ts` - Fonte unica: `buildQuoteIdentifierWhereCandidates`, `QuotePrismaDelegate`, `findQuoteByIdentifierBasic`
- `apps/backend/src/modules/quotes/quote-identifier.util.test.ts` - Testes A-E do util
- `apps/backend/src/modules/integrations/nfse/nfse.service.identificador.test.ts` - Testes F-J: regressao do 404 em `emitirQuoteNfseAutomatica`, `resolverTomadorQuote` e `removerQuoteNfse`
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` - Novo metodo privado `carregarQuotePorIdentificador`; os 5 pontos que liam `prisma.quote.findUnique({ id: quoteId })` agora usam o resolver compartilhado
- `apps/backend/src/modules/quotes/quotes.service.ts` - `findQuoteByIdentifier` reescrito para consumir o util; `QUOTE_DETAIL_INCLUDE` extraida como constante de modulo
- `apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts` - Duplo de prisma trocado de `findUnique` para `findFirst` (12 testes, mesmas assercoes)
- `apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts` - Duplo de prisma trocado de `findUnique` para `findFirst` (4 testes, mesmas assercoes)

## Decisions Made

- Util puro sem DI (padrao `athos-fk.util.ts`) em vez de injetar `QuotesService` no `NfseService` — evita mais um ciclo de `forwardRef` no grafo de modulos (`QuotesModule` <-> `AthosModule`/`ChatwootModule`, `NfseModule` -> `AthosModule`/`ChatwootModule`) e evita carregar as relacoes pesadas (`customer`, `items`, `stamps`, `documents`) que o `NfseService` nao usa.
- `externalQuoteId` construido via `BigInt(identifier)` direto da string, nunca via `Number` — mitigacao T-iz0-02, coberta pelo Teste C.
- `QUOTE_DETAIL_INCLUDE` extraida como constante de modulo — reducao pura de duplicacao, sem mudar a assinatura de `findQuoteByIdentifier` nem os 8 call sites internos que dependem dele.

## Deviations from Plan

None - plan executado exatamente como escrito. As duas tasks (tracer + auto) seguiram o roteiro RED/GREEN descrito no PLAN.md sem necessidade de correcoes de escopo, bugs adicionais ou decisoes arquiteturais fora do planejado.

## Issues Encountered

None - os 16 testes preexistentes de tomador/chatwoot precisaram apenas trocar o metodo do duplo de prisma (`findUnique` -> `findFirst`), exatamente como o PLAN.md antecipava; nenhuma assercao de comportamento mudou.

## Verification Gates (todas automatizadas, rodadas nesta maquina)

1. `npm --prefix apps/backend run test -- src/modules/quotes/quote-identifier.util.test.ts src/modules/integrations/nfse/nfse.service.identificador.test.ts` — 8/8 (depois 10/10 com I/J) verdes
2. `npm --prefix apps/backend run test -- src/modules/integrations/nfse src/modules/quotes` — 100/100 verdes
3. `npm --prefix apps/backend run test` — 443/443 verdes (regressao completa, sem novas falhas)
4. `npm --prefix apps/backend run build` — tsc limpo
5. Gate negativo `{ id: quoteId }` cru fora de comentario no `nfse.service.ts` = 0
6. Gate `where: { id: quote.id }` no `nfse.service.ts` = 3
7. Gate `carregarQuotePorIdentificador` (nao-comentario) = 6
8. Gate `buildQuoteIdentifierWhereCandidates` (nao-comentario) em `quotes.service.ts` = 2
9. Gate de escopo `git diff --name-only HEAD -- apps/frontend/src/app/contas-receber apps/backend/src/modules/cobranca` = vazio
10. Gate de escopo `git diff --name-only HEAD -- apps/frontend` = vazio

Todos os 10 gates automatizados passaram.

## Human-Check (nao-bloqueante, executavel — pendente)

O PLAN.md descreve um human-check executavel (usuario com `npm run dev` + Postgres de dev rodando localmente), cobrindo:

a. `/orcamento/22764` — `GET /nfse/tomador` deve responder 200 em vez de 404
b. "Emitir NFS-e automaticamente" — `POST /api/quotes/22764/nfse/emitir` nao deve mais responder 404 (falha de SEFIN/certificado e aceitavel)
c. Download do DANFSe (`GET /nfse/pdf`) e remocao (`DELETE /nfse`) devem responder normalmente em vez de 404

Este agente executou em ambiente isolado sem confirmacao de que o `npm run dev`/Postgres de dev estao ativos nesta sessao — a verificacao ponta-a-ponta contra o banco real fica pendente e foi registrada em WINDOWS.md como `unrun-verify`. A logica foi validada por 10 testes unitarios dedicados (util + regressao do 404) cobrindo exatamente os cenarios numerico/UUID/overflow que causavam o bug.

## Next Phase Readiness

- O fix e 100% backend e auto-contido; nenhuma migracao de dado, nenhuma mudanca de contrato de API (mesma mensagem de erro "Orcamento nao encontrado.", mesmo formato de resposta).
- Proximo passo operacional: rodar o human-check descrito acima contra o `/orcamento/22764` real assim que o dev server + Postgres estiverem acessiveis, e fechar o item em WINDOWS.md.

---
*Quick task: 260906-iz0*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: apps/backend/src/modules/quotes/quote-identifier.util.ts
- FOUND: apps/backend/src/modules/quotes/quote-identifier.util.test.ts
- FOUND: apps/backend/src/modules/integrations/nfse/nfse.service.identificador.test.ts
- FOUND: .planning/quick/260906-iz0-corrigir-404-orcamento-nao-encontrado-ao/260906-iz0-SUMMARY.md
- FOUND commit: a7cfdb6 (Task 1)
- FOUND commit: cdff771 (Task 2)
