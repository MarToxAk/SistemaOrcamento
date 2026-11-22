---
phase: 51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano
verified: 2026-11-21T22:10:00Z
status: human_needed
score: 12/12 must-haves verified
covered_files:
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-01-PLAN.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-01-SUMMARY.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-02-PLAN.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-02-SUMMARY.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-03-PLAN.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-03-SUMMARY.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-04-PLAN.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-04-SUMMARY.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-05-PLAN.md"
  - ".planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-05-SUMMARY.md"
  - "apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts"
  - "apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts"
  - "apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts"
  - "apps/backend/src/modules/integrations/efi/efi.service.ts"
  - "apps/backend/src/modules/quotes/quotes.service.ts"
  - "deploy/UPDATE_RUNBOOK.md"
  - "deploy/docker-compose.box.vps.yml"
  - "deploy/docker-compose.vps.yml"
  - "deploy/stack.env.example"
covered_digest: "v4:sha256:bb5030fbd98935ead6a5b8425f1f3dec9bdc42a8fa335bc8b7a316f84cefce5e"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Passo 0 do roteiro: confirmar que o PR #75 (commit 3709ae5, CHATWOOT_AUTOMATION_* e CHATWOOT_AI_*) esta implantado e que CHATWOOT_AUTOMATION_STATUS_FECHAMENTO=PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO no servidor"
    expected: "git merge-base --is-ancestor 3709ae5 origin/main (ou o token em deploy/stack.env.example de origin/main) passa; sem isso o webhook de fechamento nao funciona nos composes"
    why_human: "Pre-condicao de deploy (D-23). Verificado agora: 3709ae5 NAO e ancestral de origin/main e origin/main nao tem CHATWOOT_AUTOMATION_WEBHOOK_TOKEN. O merge-tree com a branch do PR #75 e limpo (compativel), mas a implantacao e fora do repositorio"
  - test: "Passo 1 do roteiro: sonda somente de leitura de GET /conversations/:id numa conversa resolvida de teste (premissa A3)"
    expected: "status=resolved, messages e lista, created_at em segundos (ou formato conhecido), message_type 0/incoming para cliente. Se diferir, NAO ativar o fechamento (o codigo descarta a despedida como indeterminado)"
    why_human: "Exige a API real do Chatwoot; os testes usam axios falso e as heuristicas de created_at/message_type sao suposicoes"
  - test: "Passos 2 a 5 do roteiro: trocar status de orcamento de teste com conversa (manual, lote, PIX/cartao, enviar ao cliente)"
    expected: "A etiqueta da fase troca, as manuais ficam, cliente-frequente aparece com 3+ pedidos concretizados em 6 meses, sem atrasar a mensagem ao cliente"
    why_human: "Cor, ordem e substituicao real de labels no Chatwoot exigem instancia real"
  - test: "Passos 6 a 8 do roteiro: resolver conversa liberada, bloqueada e reaberta antes do prazo; cronometrar"
    expected: "finalizado (+ cliente-frequente) na hora; mensagem unica entre 45 e 180 s; bloqueada reabre com nota e mantem a fase; reabertura cancela a mensagem e restaura fase"
    why_human: "Exige tempo real, WhatsApp/Chatwoot reais; reinicio do container (descarte do timer) tambem so manual"
  - test: "Revisao de diff CW-12 (D-14): nenhum trecho especifico de Box ou Bom Custo"
    expected: "git diff 810c059 -- apps/backend deploy sem condicionais por tenant"
    why_human: "Criterio de revisao de codigo; a checagem automatica desta verificacao (grep de box/bom custo nas linhas adicionadas de apps/backend/src) nao achou nenhum trecho de tenant, mas a conferencia final e do operador"
---

# Fase 51: Chatwoot, etiquetas por fase, cliente frequente e delay humano - Relatorio de Verificacao

**Objetivo da fase:** A conversa do Chatwoot vinculada a um orcamento mostra a etiqueta da fase atual (substitui a anterior a cada troca) e `cliente-frequente` com 3+ pedidos pagos/entregues em 6 meses. Ao resolver a conversa liberada, ficam apenas `finalizado` (+ `cliente-frequente`); bloqueio por pendencia mantem a fase. A mensagem de encerramento sai com atraso aleatorio humano. Vale para Box e Bom Custo.
**Verificado em:** 2026-11-21
**Status:** human_needed
**Re-verificacao:** Nao, verificacao inicial

## Execucao objetiva

| Verificacao | Comando | Resultado |
|---|---|---|
| Testes | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot src/modules/quotes src/modules/integrations/efi --no-coverage` | 21 suites passed + 1 skipped (pre-existente); 325 passed, 18 skipped, 0 failed |
| Typecheck | `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 |
| YAML dos composes | `yaml.safe_load` nos dois composes | ok |
| Gate PR #75 (compatibilidade) | `git merge-tree --write-tree HEAD fix/compose-chatwoot-automation-env` | limpo |
| Gate PR #75 (implantacao) | `merge-base --is-ancestor 3709ae5 origin/main` / token em origin/main | NAO satisfeito (checkpoint de deploy manual, ver humano #1) |

## Verdades observaveis (CW-01..CW-12)

| # | Verdade | Status | Evidencia no codigo |
|---|---|---|---|
| CW-01 | Mapa de 8 status para etiquetas (D-01/D-15) | VERIFIED | `ETIQUETA_FASE_POR_STATUS: Record<QuoteStatus,string>` em `chatwoot-etiquetas.ts` (tipo exaustivo): PENDENTE=orcamento-pendente, ENVIADO=orcamento-enviado, PAGAMENTO_PARCIAL=pagamento-parcial, APROVADO=aprovado, EM_PRODUCAO=em-producao, PRONTO_PARA_ENTREGA=pronto-entrega, ENTREGUE=entregue, CANCELADO=cancelado; coberto em `chatwoot-etiquetas.test.ts` |
| CW-02 | So a etiqueta da fase atual da cotacao mais recente; GET, mescla, POST so se mudou; manuais preservadas | VERIFIED | `aplicarEtiquetasGerenciadas` (GET, `mesclarEtiquetas` mantem as fora do conjunto, POST so se `!etiquetasIguais`); `sincronizarEtiquetasChatwoot` usa `findFirst orderBy updatedAt desc` dentro da fila; testes E1, E4, F2, F3 |
| CW-03 | Etiqueta em todos os caminhos que gravam status, depois do commit, sem await, sem bloquear | VERIFIED | Todos os `quote.update` com `status` no repo mapeados: `changeStatus` (hook apos update; 7 chamadores passam por ele: linhas 388, 503, 559, 1155 lote, 2165 approveByConversation, controller), `enviarParaCliente` (hook so quando a transicao para ENVIADO ocorre), create/upsert (hook apos a `$transaction`), EFI PIX e cartao (hook apos `$transaction`, so se `nextStatus !== quote.status`, tolera mock sem o metodo). `athos-listener` e `nfse` nao gravam status. Testes E1..E5, H1..H5 (EFI), mensagem/chatwoot |
| CW-04 | Codigo nunca cria etiquetas; etiqueta inexistente, 4xx ou timeout viram warn sem segredo | VERIFIED | Nenhum POST em `/labels` de conta no diff; `sincronizarEtiquetasChatwoot` envolve tudo em try/catch com warn so de `quoteId` e `err.message`; axios com `timeout: 10000`; testes E2, E5, E7 (token ausente do log) |
| CW-05 | Cliente frequente: >=3 de APROVADO/EM_PRODUCAO/PRONTO/ENTREGUE do mesmo customerId com createdAt em 6 meses, por env | VERIFIED | `clienteEhFrequente` (uma `quote.count` por `customerId`, `status in STATUS_PEDIDO_CONCRETIZADO`, `createdAt gte` janela UTC), `lerLimiaresClienteFrequente` com padroes 3 e 6 e fallback para valor invalido; recalculado a cada sincronizacao; testes F1, F2, F4, F6 |
| CW-06 | cliente-frequente permanece apos finalizar | VERIFIED | `enfileirarEtiquetasFinalizado` grava `[finalizado, cliente-frequente?]`; teste A1/A5 |
| CW-07 | Fechamento liberado: so `finalizado` (+ frequente), enfileirado sem await, tambem no ramo "ja enviada hoje" | VERIFIED | `handleConversationResolved` chama `enfileirarEtiquetasFinalizado` ANTES de `podeEnviarMensagemFechamento` (bug de ordem D-19 corrigido); `addConversationLabels` substitui a lista (remove manuais, D-06); testes A1, A2, A4 |
| CW-08 | Bloqueio por pendencia mantem a fase; status que liberam por env | VERIFIED | Ramo bloqueado so faz `toggleConversationStatus(open)` e `postConversationNote`, sem tocar em etiquetas nem contagem; `getStatusPermitidosFechamento` le `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO`; testes A3, A8 (PRONTO_PARA_ENTREGA na lista) |
| CW-09 | Atraso humano triangular (45-180 s por env), webhook responde rapido, setTimeout, um timer por conversa | VERIFIED | `sortearAtrasoHumanoMs` (media de 2 sorteios), `lerAtrasoFechamentoS` (padroes 45/180, teto 900, troca invertidos), `agendarEnvioFechamento` (Map por conversa, substitui timer, `unref`), `onModuleDestroy` cancela; retorno imediato `mensagem_agendada`; testes A1, A7, A9, A11, R6 e funcoes puras |
| CW-10 | Re-check que FECHA: reaberta, resposta nova, messages nao-array, created_at ilegivel ou falha cancelam; reabertura restaura fase | VERIFIED | `enviarMensagemFechamento`: falha/null/`status !== resolved`/`resposta_nova`/`indeterminado` retornam sem enviar com motivo no log; `restaurarEtiquetasAposReabertura` tira `finalizado` e repoe fase e frequente; limite diario reavaliado no envio (A10); testes R1..R8 e `avaliarRespostaDoCliente`. Suposicoes sobre o formato real da API ficam para a sonda A3 (humano #2) |
| CW-11 | 5 envs nos dois composes e stack.env.example, padroes do codigo, so adicoes; PR #75 pre-condicao; valor de producao documentado | VERIFIED (com pre-condicao de deploy pendente) | `git diff` de deploy tem so linhas adicionadas, ancoradas apos `COBRANCA_AVISO_DRY_RUN` e padroes `:-true/3/6/45/180`; `chatwoot-etiquetas.env.test.ts` amarra codigo x deploy; runbook (itens 1-11) e roteiro passo 0 documentam PR #75 e a lista de producao. Implantacao do PR #75 e checkpoint humano |
| CW-12 | Mesmo codigo para Box e Bom Custo; sem backfill; Athos de producao nunca escrito nem consultado | VERIFIED | Grep de `box`/`bom custo` nas linhas adicionadas de `apps/backend/src` sem trecho de tenant; nenhuma alteracao em `prisma/` nem script de backfill; contagem so no Prisma; testes de etiquetas montam `AthosService` falso e afirmam zero chamadas (E1, F1) |

**Score:** 12/12 verdades verificadas por codigo e teste; 0 comportamento-dependente sem evidencia de teste. O status e `human_needed` por causa dos itens exclusivamente manuais abaixo.

## Decisoes D-01..D-24

| Decisao | Status | Observacao |
|---|---|---|
| D-01, D-15 | VERIFIED | Mapa com PENDENTE e ENVIADO conforme D-15 |
| D-02, D-04 | VERIFIED | GET, mescla preservando manuais, POST so se mudou |
| D-03 | VERIFIED | Todos os escritores de status cobertos (tabela CW-03) |
| D-05, D-18 | VERIFIED | Codigo nao cria etiquetas; toleracia por try/catch. Existencia das 10 etiquetas nos Chatwoots: conferencia somente leitura no roteiro passo 0.4 |
| D-06, D-07, D-08 | VERIFIED | Ver CW-07 e CW-08 |
| D-09, D-11, D-16 | VERIFIED | customerId, createdAt, 4 status, env |
| D-10 | VERIFIED | CW-06 |
| D-12, D-22 | VERIFIED | Triangular por env |
| D-13 | VERIFIED | Re-check que fecha |
| D-14 | VERIFIED (revisao humana final recomendada) | Sem condicionais por tenant |
| D-17 | VERIFIED | Sem backfill |
| D-19, D-20 | VERIFIED | Etiquetas na hora, so a mensagem agendada, dedupe por Map |
| D-21 | VERIFIED (divida respeitada) | `approveByConversation`, re-post sem status e `mergeDuplicates` nao foram alterados; registrados no ROADMAP |
| D-23 | PARCIAL, humano | Documentado e com teste de compatibilidade; implantacao do PR #75 pendente (3709ae5 fora de origin/main) |
| D-24 | VERIFIED | Documentado em runbook, roteiro e docstrings; fila e timers em memoria |

## Artefatos e ligacoes

| Artefato | Status | Detalhe |
|---|---|---|
| `chatwoot-etiquetas.ts` (357 linhas) | VERIFIED | Regras puras, fila com teto 3, timers, avaliacao de resposta; importado por `quotes.service.ts` e `chatwoot-automation.service.ts` |
| `chatwoot.service.ts` (`getConversationLabels`, `getConversation`, timeout 10 s no POST) | VERIFIED | Usados pelas regras e pelo re-check |
| `quotes.service.ts` (`sincronizarEtiquetasChatwoot`, `dispararEtiquetasChatwoot`) | VERIFIED | Chamado de changeStatus, create/upsert, enviarParaCliente e EFI |
| `efi.service.ts` (`dispararEtiquetasChatwoot`) | VERIFIED | Dois webhooks, so quando o status muda |
| `chatwoot-automation.service.ts` | VERIFIED | Controller continua compativel (retorno tipado, tsc ok) |
| Composes, `stack.env.example`, runbook, roteiro | VERIFIED | So adicoes; YAML valido |

Fluxo de dados: a etiqueta da fase e o cliente frequente vem de leituras frescas do Prisma dentro da fila por conversa; nao ha valor estatico ou mock no caminho de producao (Level 4: FLOWING).

## Anti-padroes

Nenhum `TBD`/`FIXME`/`XXX` nos arquivos alterados. Nenhum stub. Nenhum blocker.

## Limitacoes aceitas (nao sao gaps)

Documentadas em `51-VALIDATION.md` e no runbook: `finalizado` so sai pelo re-check de reabertura dentro da janela ou manualmente; reinicio perde a mensagem agendada (etiquetas ficam); fila e timers por processo (instancia unica); APROVADO por link sem pagamento conta para cliente-frequente; COUNT por cliente sem indice; kill-switch `CHATWOOT_ETIQUETAS_ATIVAS` nao cobre o fechamento. Itens da D-21 ficam como divida fora da fase.

## Gaps

Nenhum gap de codigo. Pendencias sao exclusivamente de homologacao e deploy (secao humano no frontmatter).

---

_Verificado: 2026-11-21_
_Verificador: Claude (gsd-verifier)_
