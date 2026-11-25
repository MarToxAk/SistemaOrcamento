---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 04
subsystem: integrations/efi
tags: [pix, comprovante, chatwoot, webhook, nota-privada, efi]
requires: ["54-02", "54-03"]
provides:
  - "EfiService.buscarComprovanteOficial(e2eId): GET /v2/gn/pix/comprovantes com validacao de bytes, nunca lanca"
  - "postarComprovantePix: nota privada com texto completo e anexo (oficial, proprio ou so texto) apos o commit"
  - "EfiService com PixComprovanteService opcional no construtor"
affects: [54-11]
tech-stack:
  added: []
  patterns: ["bloco de notificacao independente, com prazo (Promise.race) e try/catch proprio", "dependencias opcionais atras de typeof function para manter mocks antigos"]
key-files:
  created:
    - apps/backend/src/modules/integrations/efi/efi.comprovante-oficial.test.ts
    - apps/backend/src/modules/integrations/efi/efi.webhook.comprovante.test.ts
  modified:
    - apps/backend/src/modules/integrations/efi/efi.service.ts
key-decisions:
  - "Tipo do anexo oficial derivado dos primeiros bytes (PNG, JPEG, %PDF), nunca do cabecalho content-type da resposta."
  - "sendAttachment ou postConversationNote devolvendo { enabled: false } (Chatwoot nao configurado) conta como falha do anexo e aciona a nota so de texto / log de falha, em vez de logar sucesso falso."
  - "conversationId do comprovante vem do mesmo calculo da mensagem ao cliente; se getById falhar, usa quote.conversationId, entao o comprovante nao depende do bloco da mensagem."
requirements-completed: [P54-CMP]
status: complete
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 086ca091a25f8dad5a4f7acf26fa951d004b74c6
plan_head_after: 0fa703c879a9493a0e044484e9cabc018465fb94
---

# Phase 54 Plan 04: Comprovante PIX no webhook (nota privada) Summary

O webhook PIX da EFI agora posta, depois do commit e da mensagem ao cliente, uma nota privada no Chatwoot com o texto completo do comprovante e um anexo: o comprovante oficial da EFI quando houver, senao o PNG de layout proprio do plano 54-03, senao so texto. Nada disso derruba o webhook nem chega ao cliente.

## Tarefas

| Tarefa | Descricao | Commit |
| ------ | --------- | ------ |
| 1 | `buscarComprovanteOficial`: GET `/v2/gn/pix/comprovantes` (e2eId, arraybuffer, timeout 8 s, Bearer), aceita so PNG/JPEG/%PDF, null em qualquer falha | 85a277e |
| 2 | `postarComprovantePix` no `processWebhook`, `@Optional() PixComprovanteService`, prazo de 40 s, fallback oficial -> proprio -> so texto | 0fa703c |

## Comportamento

- Ordem no webhook: transacao Prisma -> etiquetas -> mensagem ao cliente -> comprovante -> `results.push`. Testado por ordem de chamadas.
- Anexo enviado por `sendAttachment(convId, buffer, nome, mime, { private: true, content: texto })`; falhando (ou Chatwoot desabilitado), cai em `postConversationNote(convId, texto)` (tambem privada). Se tudo falhar, so loga e o item segue `processed`.
- `sendOutgoingMessage` continua recebendo apenas a mensagem de confirmacao ao cliente (D-05); teste confere que nao contem E2E, txid nem o texto do comprovante.
- Duplicado (`ignored_duplicate`) faz `continue` antes de tudo: sem busca na EFI, sem render, sem nota. Quote sem conversa: nenhuma chamada.
- Prazo: `prazoComprovanteMs` (40000 por padrao, propriedade de instancia) via `Promise.race` com timer limpo no `finally`; teste com 50 ms e `buscarComprovanteOficial` que nunca resolve.
- Numero do orcamento: `numeroOrcamento` do bloco da mensagem, senao `quote.externalQuoteId ?? quote.internalNumber`.
- Logs: sucesso `Comprovante PIX postado quoteId=<id> e2eId=<e2e> fonte=<oficial|proprio|apenas-texto>`; falha `Falha no comprovante PIX quoteId=<id> e2eId=<e2e> <mensagem curta>`. Nunca token, corpo da EFI, payload nem texto do pagador (T-54-09, testado). Observacao para o 54-11: o prefixo difere em maiuscula entre sucesso ("Comprovante PIX") e falha ("Falha no comprovante PIX"); filtrar com `grep -i "comprovante pix"`.

## Verificacao

- `npm --prefix apps/backend run test -- src/modules/integrations/efi src/modules/integrations/chatwoot`: 14 suites, 281 passed, 1 skipped (smoke do Chromium, preexistente).
- Novos: `efi.comprovante-oficial.test.ts` 11 testes; `efi.webhook.comprovante.test.ts` 18 testes. Os tres arquivos de teste antigos do EfiService passam sem edicao.
- `tsc -p tsconfig.json --noEmit` em `apps/backend`: limpo.
- RED observado na tarefa 1 (TS2339, metodo inexistente). Na tarefa 2 o primeiro run ja teve 16 de 18 verdes; as 2 falhas eram filtro do proprio teste (maiuscula do prefixo do log), corrigido no teste.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Ambiente] node_modules ausente na worktree**
- Symlinks locais nao versionados (`node_modules`, `apps/backend/node_modules`) para o repo principal; `tsc` rodado direto em `apps/backend` (o `npm exec -w` resolveria para o repo principal). Nao commitados.

**2. [Rule 2 - Robustez] `{ enabled: false }` tratado como falha**
- `ChatwootService.sendAttachment`/`postConversationNote` devolvem `{ enabled: false }` sem lancar quando o Chatwoot nao esta configurado. Sem tratamento o log diria "postado" falsamente. Agora cai para a nota de texto e, se tambem desabilitada, vira "Falha no comprovante PIX".
- Commit: 0fa703c

**3. [Ordem TDD] Tarefa 2 sem RED separado**
- Testes e implementacao foram escritos na mesma passada; o primeiro run ja era GREEN exceto o filtro de log do teste.

Fora isso, plano executado como escrito. STATE.md e ROADMAP.md nao foram atualizados (worktree paralelo; o orquestrador consolida), mesmo criterio dos planos 54-01 a 54-03.

## Auth gates

Nenhum.

## Known Stubs

Nenhum.

## Deferred / Pontos de atencao

- **54-11 (humano):** habilitar o escopo `gn.receipts.read` no painel da EFI; o token fica em cache por cerca de 1 h, entao reiniciar o backend ou esperar expirar. Ate la a nota sai com o PNG de layout proprio. Comportamento do endpoint oficial para PIX recebido segue nao provado (A2/A3 da pesquisa).
- Se o comprovante estourar o prazo de 40 s, o processamento em segundo plano continua e pode postar a nota depois que o webhook ja respondeu (aceito: nunca duplica, pois e uma unica execucao por pagamento).
- D-17 (webhook `@Public()` sem guard) segue deferido; `efi.controller.ts` nao foi tocado.

## Threat Flags

Nenhum alem dos ja registrados. Mitigacoes T-54-09 (logs sem dados sensiveis), T-54-10 (bloco isolado, prazo, try/catch) e T-54-11 (`private: true` em todas as saidas, cliente so recebe confirmacao) implementadas e testadas.

## Self-Check: PASSED

- Arquivos existem: efi.service.ts, efi.comprovante-oficial.test.ts, efi.webhook.comprovante.test.ts.
- Commits 85a277e e 0fa703c presentes no historico do ramo.
