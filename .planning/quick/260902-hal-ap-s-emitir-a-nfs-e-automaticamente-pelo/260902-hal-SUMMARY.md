---
phase: 260902-hal-ap-s-emitir-a-nfs-e-automaticamente-pelo
plan: 01
subsystem: nfse
tags: [nestjs, nextjs, chatwoot, danfse-nacional, best-effort]

requires:
  - phase: 260828-g45
    provides: "DanfseNacionalPdfService.gerar(xmlNacional) — renderiza o DANFSe nacional NT 008/2026 via nfse-node/danfse"
  - phase: 260902-gi9
    provides: "NfseModule com AthosModule ja importado; nfseXml disponivel em memoria dentro de emitirQuoteNfseAutomatica"
  - phase: multiple (ChatwootModule/ChatwootService)
    provides: "sendOutgoingMessage + sendAttachment ja em producao para o PDF do orcamento (quotes.service.ts)"
provides:
  - "NfseService.enviarDanfseParaCliente(quote, nfseXml, numeroNfse): entrega best-effort do DANFSe pelo Chatwoot, resolvido so por quote.conversationId"
  - "emitirQuoteNfseAutomatica devolve envioChatwoot: { enviado: boolean; motivo?: string } no corpo da resposta"
  - "Tela /orcamento/[id] informa se o DANFSe foi entregue ao cliente ou o motivo de nao ter sido"
affects: [nfse, orcamento, chatwoot-integration]

actuals:
  tokens: 3193
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Entrega de anexo por Chatwoot dentro do proprio metodo de emissao reusa o padrao ja em producao em quotes.service.ts (resendPdfToChatwoot/enviarParaCliente): sendOutgoingMessage seguido de sendAttachment, ambos em try/catch que nunca propaga"

key-files:
  created:
    - apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.module.ts
    - apps/frontend/src/app/orcamento/[id]/page.tsx

key-decisions:
  - "D-00 (confirmada pelo usuario): A1 (anexar PDF direto na mensagem, nao link) + B1 (envio sincrono/aguardado com campo envioChatwoot na resposta)"
  - "D-04: prisma.quote.update executa ANTES da entrega — entrega inteira em try/catch que nunca lanca; falha de Chatwoot/PDF nunca reverte, bloqueia ou mascara a emissao"
  - "D-05/T-HAL-01: destino resolvido exclusivamente por quote.conversationId — proibido searchContact ou busca por nome/documento (vazamento de dado fiscal)"
  - "D-06: cobranca/** e contas-receber/** intocados, confirmado por diff"
  - "D-07: baixarDanfsePdf e GET /quotes/:quoteId/nfse/pdf continuam no renderizador legado DanfsePdfService — divergencia de layout conhecida e aceita, fora de escopo"

patterns-established:
  - "enviarDanfseParaCliente como metodo privado dedicado (nao inline em emitirQuoteNfseAutomatica) — isola a logica best-effort e facilita reuso/teste"

requirements-completed: [QT-HAL-01, QT-HAL-02, QT-HAL-03]

coverage:
  - id: D1
    description: "Emissao com conversationId presente e Chatwoot saudavel: danfseNacionalPdfService.gerar recebe exatamente o nfseXml devolvido por nfseNacionalService.emitir; sendOutgoingMessage e sendAttachment sao chamados com o conversationId, o Buffer do PDF, nome NFSe-<numero>.pdf e content-type application/pdf; resposta traz envioChatwoot.enviado=true"
    requirement: QT-HAL-01
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts#Teste 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Quote sem conversationId: nenhuma chamada ao Chatwoot nem render de PDF; resposta ainda traz numero/link da nota e envioChatwoot.enviado=false com motivo"
    requirement: QT-HAL-03
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts#Teste 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "Falha no render do DANFSe (danfseNacionalPdfService.gerar rejeita): emissao continua bem-sucedida (numero/link presentes), prisma.quote.update chamado normalmente, envioChatwoot.enviado=false, nenhuma excecao propaga"
    requirement: QT-HAL-02
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts#Teste 3"
        status: pass
    human_judgment: false
  - id: D4
    description: "Falha no sendAttachment apos sendOutgoingMessage ter passado: mesma garantia — emissao intacta, envioChatwoot.enviado=false, sem excecao propagada"
    requirement: QT-HAL-02
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts#Teste 4"
        status: pass
    human_judgment: false
  - id: D5
    description: "Operador ve na tela de orcamento se o DANFSe foi entregue ao cliente ou nao, e o motivo quando nao foi, mantendo o estado visual de sucesso da emissao nos dois casos"
    requirement: QT-HAL-03
    human_judgment: true
    rationale: "Requer backend + Chatwoot reais rodando para validar visualmente a mensagem apos emitir uma NFS-e real com conversationId vinculado — verificacao humana diferida (item da <verification> do plano)"
---

# Quick Task 260902-hal: Entrega Automatica do DANFSe pelo Chatwoot apos Emissao de NFS-e Summary

**Apos emitir a NFS-e automaticamente pelo `/orcamento/[id]`, `NfseService` gera o DANFSe nacional (NT 008/2026) a partir do XML assinado ja em memoria e o envia como anexo ao cliente pelo Chatwoot, best-effort e sem intervencao do operador.**

## Performance

- **Duration:** ~15min
- **Completed:** 2026-09-02
- **Tasks:** 2 completed
- **Files modified:** 4 (1 criado, 3 modificados)

## Accomplishments
- `NfseModule` importa `ChatwootModule` (sem novo ciclo — `ChatwootModule` nao tem `imports` proprios) para injetar `ChatwootService` em `NfseService`, ao lado do `DanfseNacionalPdfService` ja provido pelo proprio modulo.
- Novo metodo privado `NfseService.enviarDanfseParaCliente(quote, nfseXml, numeroNfse)`: resolve o destino exclusivamente por `quote.conversationId` (nunca por busca de contato), gera o DANFSe via `DanfseNacionalPdfService.gerar(nfseXml)` — o mesmo XML literal que `NfseNacionalService.emitir()` acabou de devolver, sem conversao — e entrega com `sendOutgoingMessage` + `sendAttachment` (mesma ordem/padrao ja em producao em `quotes.service.ts`). Todo o corpo esta em try/catch que nunca lanca.
- `emitirQuoteNfseAutomatica` chama `enviarDanfseParaCliente` **depois** de `prisma.quote.update` persistir a nota — falha de PDF/Chatwoot nunca reverte, bloqueia ou mascara a emissao ja definitiva no SEFIN — e devolve `envioChatwoot: { enviado, motivo? }` no corpo da resposta.
- Tela `/orcamento/[id]`: `handleEmitirNfseAutomatica` le `data.envioChatwoot` e complementa a mensagem de sucesso indicando se o DANFSe foi enviado ao cliente pelo Chatwoot ou o motivo de nao ter sido; `setNfseState("sucesso")` continua sendo chamado nos dois casos.

## Task Commits

Ciclo TDD (`tdd="true"`) para a Tarefa 1 — 2 commits (RED/GREEN); Tarefa 2 sem TDD — 1 commit:

1. **Tarefa 1 (RED):** `test(quick-260902-hal): add failing test for entrega do DANFSe pelo Chatwoot` - `c3fbaf5` (test)
2. **Tarefa 1 (GREEN):** `feat(quick-260902-hal): gerar DANFSe e entregar automaticamente no Chatwoot apos emitir NFS-e` - `3b07645` (feat)
3. **Tarefa 2:** `feat(quick-260902-hal): exibir na tela de orcamento se o DANFSe foi entregue ao cliente` - `e1e2f8e` (feat)

_TDD Gate Compliance: RED (`c3fbaf5`, 6 falhas TS2339 — `envioChatwoot` inexistente no tipo de retorno, antes da implementacao) seguido de GREEN (`3b07645`, 4/4 testes novos verdes). Sem REFACTOR — nenhuma limpeza necessaria apos GREEN._

## Tracer Feedback Gate

Task 1 e `type="tracer"`. Apos o commit GREEN, o gate de feedback foi satisfeito re-executando o `<verify>` completo da tarefa end-to-end (modo `end-of-phase`, `<verify>` 100% automatizado):
- `npm --workspace @orcamento/backend run test -- nfse.service.chatwoot` — 4/4 verdes
- `npm --workspace @orcamento/backend run test` — 36 suites / 433 testes verdes
- `npm --workspace @orcamento/backend run build` — `tsc` limpo

Todos passaram; prosseguiu para a Tarefa 2 sem checkpoint.

## Files Created/Modified
- `apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts` - 4 testes unitarios de `enviarDanfseParaCliente`/`envioChatwoot` (conversationId presente, ausente, falha de render, falha de sendAttachment)
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` - `enviarDanfseParaCliente` novo + injecao de `DanfseNacionalPdfService`/`ChatwootService` + `emitirQuoteNfseAutomatica` passa a devolver `envioChatwoot`
- `apps/backend/src/modules/integrations/nfse/nfse.module.ts` - `ChatwootModule` adicionado aos imports (sem ciclo)
- `apps/frontend/src/app/orcamento/[id]/page.tsx` - `handleEmitirNfseAutomatica` le `envioChatwoot` e complementa `nfseMsg`

## Decisions Made
- Envio sincrono/aguardado dentro do request de emissao (D-02): o custo de latencia (render do PDF + upload) e aceito em troca do operador saber na hora se o cliente recebeu.
- `enviarDanfseParaCliente` como metodo privado dedicado (nao inline) — isola a logica best-effort e mantem `emitirQuoteNfseAutomatica` legivel.
- Nenhuma alteracao no proxy `apps/frontend/src/app/api/quotes/[id]/nfse/emitir/route.ts`: ja repassa o JSON inteiro do backend (`NextResponse.json(data)`), incluindo o novo campo `envioChatwoot` sem qualquer mudanca de codigo.

## Deviations from Plan

**Pre-requisito de codigo desatualizado no worktree (auto-corrigido antes da Tarefa 1):** o branch do worktree (`worktree-agent-afa62b97200cc8aa5`) foi criado a partir de um commit anterior ao merge da quick task `260902-gi9` (que introduziu `resolverTomadorQuote`, a importacao de `AthosModule` em `NfseModule` e os campos de tomador no formulario — pre-requisitos que este plano assume existirem, conforme `<context>`/`<interfaces>` do PLAN.md). Antes de qualquer edicao, o branch do worktree foi atualizado com `git merge` (fast-forward, sem conflitos) trazendo os 3 commits de `260902-gi9` ja mesclados em `main`. Nenhum arquivo de `cobranca/**` ou `contas-receber/**` foi tocado por esse merge. Tratado como Rule 3 (bloqueio de pre-requisito ausente) — nao e uma mudanca arquitetural, apenas sincronizacao de base do branch.

Fora esse ajuste de sincronizacao, plano executado exatamente como escrito — as 4 tarefas de comportamento descritas no `<behavior>` da Tarefa 1 foram implementadas com a mesma cobertura, e a Tarefa 2 seguiu a acao descrita sem desvios.

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuracao de servico externo necessaria. Reusa as mesmas variaveis `CHATWOOT_BASE_URL`/`CHATWOOT_ACCOUNT_ID`/`CHATWOOT_API_TOKEN` ja configuradas para o restante da integracao Chatwoot.

## Next Phase Readiness

- Verificacao humana ponta-a-ponta (pendente, mesmo padrao das quick tasks 260902-gi9 e 260828-g45): emitir uma NFS-e por um orcamento com conversa Chatwoot vinculada e confirmar que a conversa recebeu a mensagem e o PDF abre com o layout nacional (canhoto incluso).
- `apps/backend/src/modules/cobranca/**`, `apps/frontend/src/app/contas-receber/**` e `apps/frontend/src/app/api/cobranca/**` permanecem intocados (D-06), confirmado por `git log --name-only` do range do plano sem nenhum arquivo desses diretorios.
- `NfseService.baixarDanfsePdf` e `GET /quotes/:quoteId/nfse/pdf` seguem no renderizador legado `DanfsePdfService` (D-07) — divergencia de layout conhecida entre o PDF que o operador baixa e o DANFSe enviado ao cliente, a unificar em rodada futura.

---
*Quick Task: 260902-hal*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 4 files created/modified confirmed present on disk; all 3 task commits (`c3fbaf5`, `3b07645`, `e1e2f8e`) confirmed present in `git log --oneline`.
