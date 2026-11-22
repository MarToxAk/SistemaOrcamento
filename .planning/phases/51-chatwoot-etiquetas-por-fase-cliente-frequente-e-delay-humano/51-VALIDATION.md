---
phase: "51"
slug: "chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 51 — Validation Strategy

> Contrato de validação por fase para amostragem de feedback durante a execução.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30 + ts-jest 29 (backend). Sem frontend nesta fase. |
| **Config file** | `apps/backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`) |
| **Quick run command** | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot --no-coverage` (baseline em 810c059: 1 suíte, 19 testes) |
| **Quotes + EFI + Chatwoot** | `cd apps/backend && ../../node_modules/.bin/jest src/modules/quotes src/modules/integrations/efi src/modules/integrations/chatwoot --no-coverage` (baseline: 17 suítes, 16 passed + 1 skipped, 200 passed + 18 skipped, ~18 s) |
| **Full suite command** | `cd apps/backend && ../../node_modules/.bin/jest --no-coverage` (baseline em 810c059: 83 suítes, 81 passed + 2 skipped; 1171 passed + 28 skipped, ~17 s) |
| **Typecheck** | `npx tsc --noEmit -p apps/backend/tsconfig.json` (baseline: exit 0, ~5 s) |
| **YAML dos composes** | `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" deploy/docker-compose.box.vps.yml deploy/docker-compose.vps.yml` |
| **Estimated runtime** | ~17 s (suíte completa); teste de arquivo < 10 s |

---

## Sampling Rate

- **After every task commit:** rodar o teste do arquivo tocado (`cd apps/backend && ../../node_modules/.bin/jest <caminho> --no-coverage`) + `npx tsc --noEmit -p apps/backend/tsconfig.json`
- **After every plan wave:** `cd apps/backend && ../../node_modules/.bin/jest src/modules/quotes src/modules/integrations/efi src/modules/integrations/chatwoot --no-coverage`
- **Before `/gsd-verify-work`:** suíte completa do backend verde, `tsc` do backend com 0 erros, YAML dos composes válido, `git merge-tree --write-tree HEAD fix/compose-chatwoot-automation-env` sem conflito (enquanto a ref existir) e roteiro de homologação executado (51-ROTEIRO-HOMOLOGACAO.md)
- **Max feedback latency:** 20 seconds
- **Segurança dos testes:** nenhum teste toca Chatwoot, IA, EFI, Athos ou banco reais (axios, Prisma e serviços sempre falsos; relógio por `jest.useFakeTimers`); o Athos de produção nunca é consultado nem escrito nesta fase

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | CW-01, CW-02, CW-03, CW-04 | T-51-01, T-51-03, T-51-04 | changeStatus -> GET -> mescla -> POST só se mudou; falha do Chatwoot não bloqueia; sem conversa não há HTTP | tracer (axios falso) | `cd apps/backend && ../../node_modules/.bin/jest src/modules/quotes/quotes.service.etiquetas --no-coverage` | ❌ W0 (criado na própria task) | ⬜ pending |
| 51-01-02 | 01 | 1 | CW-01, CW-02, CW-03, CW-12 | T-51-02 | kill-switch; log sem token; mapa e mescla por exaustão do enum | unit (puro) + service | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot src/modules/quotes/quotes.service.etiquetas --no-coverage` | ❌ W0 | ⬜ pending |
| 51-02-01 | 02 | 2 | CW-02, CW-05, CW-12 | T-51-06, T-51-07, T-51-09 | cliente frequente por customerId/4 status/createdAt; cotação mais recente; fila serializada com teto 3 | tracer + unit | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot/chatwoot-etiquetas src/modules/quotes/quotes.service.etiquetas --no-coverage` | ✅ (de 51-01; casos novos ❌) | ⬜ pending |
| 51-02-02 | 02 | 2 | CW-03 | T-51-11 | gancho após o commit em enviarParaCliente e create; falha não derruba | service | `cd apps/backend && ../../node_modules/.bin/jest src/modules/quotes/quotes.service.mensagem src/modules/quotes/quotes.service.chatwoot --no-coverage` | ✅ (casos novos ❌) | ⬜ pending |
| 51-02-03 | 02 | 2 | CW-03 | T-51-08, T-51-10, T-51-11 | gancho após a transação nos webhooks PIX e cartão só com mudança de status; mock antigo sem o método não quebra | service | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/efi --no-coverage` | ✅ (casos novos ❌) | ⬜ pending |
| 51-03-01 | 03 | 3 | CW-06, CW-07, CW-08, CW-09 | T-51-13, T-51-14, T-51-15 | etiquetas na hora (inclusive ramo "já enviada hoje"); bloqueada sem etiquetas; mensagem agendada com atraso e dedupe | tracer (fake timers) | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot/chatwoot-fechamento-agendado src/modules/integrations/chatwoot/chatwoot-automation.service --no-coverage` | ❌ W0 (criado na própria task); automação ✅ (3 testes reescritos) | ⬜ pending |
| 51-03-02 | 03 | 3 | CW-10 | T-51-14, T-51-16, T-51-17 | re-check: reaberta ou resposta nova não envia; reabertura restaura fase; falha do re-check não envia | service (fake timers) + HTTP falso | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot --no-coverage` | ✅ (de 51-03-01; casos novos ❌) | ⬜ pending |
| 51-04-01 | 04 | 4 | CW-11, CW-12 | T-51-18, T-51-19, T-51-20 | 5 envs só adicionadas nos composes e no exemplo, iguais aos padrões do código; sem conflito com o PR #75 | unit (lê arquivos) + gates git/yaml | `cd apps/backend && ../../node_modules/.bin/jest src/modules/integrations/chatwoot/chatwoot-etiquetas.env --no-coverage` | ❌ W0 (criado na própria task) | ⬜ pending |
| 51-04-02 | 04 | 4 | CW-11, CW-12 | T-51-17 | runbook e roteiro documentam reinício, desligamento e instância única; gate final verde | suíte completa + tsc | `cd apps/backend && ../../node_modules/.bin/jest --no-coverage` | n/a (docs) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requisitos locais da fase (definidos no planejamento)

| ID | Descrição | Decisões | Planos |
|----|-----------|----------|--------|
| CW-01 | Mapa status -> etiqueta de fase: PENDENTE=orcamento-pendente, ENVIADO=orcamento-enviado, PAGAMENTO_PARCIAL=pagamento-parcial, APROVADO=aprovado, EM_PRODUCAO=em-producao, PRONTO_PARA_ENTREGA=pronto-entrega, ENTREGUE=entregue, CANCELADO=cancelado | D-01, D-15 | 51-01 |
| CW-02 | Fica só a etiqueta da fase atual da cotação mais recente da conversa: lê as atuais (GET), remove a fase anterior, aplica a nova, preserva etiquetas manuais e só grava (POST, que substitui a lista) quando mudou | D-02, D-04 | 51-01, 51-02 |
| CW-03 | Etiqueta aplicada em todos os caminhos que gravam status (changeStatus e seus 7 chamadores, enviarParaCliente, create/upsert, webhook EFI PIX e cartão), depois do commit, sem await e sem nunca bloquear a mudança de status | D-03 | 51-01, 51-02 |
| CW-04 | Tolerância: o código não cria etiquetas de conta (as 10 já existem nos dois Chatwoots); etiqueta inexistente, 4xx ou timeout do Chatwoot viram warn sem segredo, nunca exceção | D-05, D-18 | 51-01 |
| CW-05 | Cliente frequente: >= 3 orçamentos APROVADO/EM_PRODUCAO/PRONTO_PARA_ENTREGA/ENTREGUE do mesmo customerId com createdAt nos últimos 6 meses; recalculado a cada troca de status; limiares por env | D-09, D-11, D-16 | 51-02 |
| CW-06 | cliente-frequente permanece após finalizar (atributo do cliente, não da fase) | D-10 | 51-03 |
| CW-07 | Fechamento liberado: só `finalizado` (+ cliente-frequente), removendo as demais inclusive manuais, aplicado na hora e também no ramo "mensagem já enviada hoje" (bug de ordem corrigido) | D-06, D-19, D-20 | 51-03 |
| CW-08 | Fechamento bloqueado por pendência mantém a etiqueta da fase (nenhuma mudança de etiquetas), reabre com nota; status que liberam configuráveis por CHATWOOT_AUTOMATION_STATUS_FECHAMENTO | D-07, D-08 | 51-03 |
| CW-09 | Atraso humano antes da mensagem de encerramento: sorteio triangular (padrão 45 a 180 s, env min/max), webhook responde rápido, setTimeout em processo com um timer por conversa; reinício perde a mensagem (documentado) | D-12, D-20 | 51-03 |
| CW-10 | Re-check no disparo: conversa reaberta ou mensagem nova do cliente cancelam o envio; reabertura remove finalizado e restaura fase e cliente-frequente; falha do re-check não envia | D-13 | 51-03 |
| CW-11 | Envs novas (CHATWOOT_ETIQUETAS_ATIVAS, CHATWOOT_CLIENTE_FREQUENTE_MIN/MESES, CHATWOOT_FECHAMENTO_ATRASO_MIN_S/MAX_S) nos dois composes e no stack.env.example, com padrões do código, em bloco adicionado sem reescrever linhas do PR #75 | D-11, D-12 | 51-04 |
| CW-12 | Mesmo código para Box e Bom Custo (nada por tenant além de env) e sem backfill; Athos de produção nunca escrito nem consultado | D-14, D-17 | 51-01, 51-02, 51-04 |

### Cobertura das decisões (D-xx -> requisito -> plano)

| Decisão | Requisito | Plano |
|---------|-----------|-------|
| D-01 (mapa; PENDENTE/ENVIADO superados por D-15) | CW-01 | 51-01 |
| D-02 | CW-02 | 51-01, 51-02 |
| D-03 | CW-03 | 51-01, 51-02 |
| D-04 | CW-02 | 51-01 |
| D-05 | CW-04 | 51-01 |
| D-06 | CW-07 | 51-03 |
| D-07 | CW-08 | 51-03 |
| D-08 | CW-08 | 51-03 (teste com PRONTO_PARA_ENTREGA na lista), 51-04 (documentação) |
| D-09 (refinado por D-16) | CW-05 | 51-02 |
| D-10 | CW-06 | 51-03 |
| D-11 | CW-05, CW-11 | 51-02, 51-04 |
| D-12 | CW-09, CW-11 | 51-03, 51-04 |
| D-13 | CW-10 | 51-03 |
| D-14 | CW-12 | 51-04 (revisão de diff, manual) |
| D-15 | CW-01 | 51-01 |
| D-16 | CW-05 | 51-02 |
| D-17 | CW-12 | 51-02, 51-04 (nenhum script de backfill) |
| D-18 | CW-04 | 51-01 |
| D-19 | CW-07 | 51-03 |
| D-20 | CW-07, CW-09 | 51-03 |

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/quotes/quotes.service.etiquetas.test.ts` — tracer de CW-01/02/03/04 com `ChatwootService` real e axios falso (51-01 T1, escrito antes do código)
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts` — regras puras: mapa, mescla, kill-switch, cliente frequente, janela, fila (51-01 T2 e 51-02 T1)
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.labels.test.ts` — getConversationLabels e getConversation com axios falso (51-01 T2 e 51-03 T2)
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot-fechamento-agendado.test.ts` — CW-06..CW-10 com `jest.useFakeTimers()` (51-03 T1, escrito antes do código)
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.env.test.ts` — consistência código x deploy (51-04 T1)
- [ ] Atualizar mocks existentes sem mudar construtores: `mockQuotesService` de `efi.webhook.test.ts` e `efi.card-webhook.test.ts` (+ `sincronizarEtiquetasChatwoot`), `buildService` de `chatwoot-automation.service.test.ts` (+ `count`, `customerId`, `getConversation`), e os mocks de Chatwoot dos testes de quotes que tenham cotação com conversationId
- Nenhum framework a instalar; nenhum pacote novo; sem frontend.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Etiquetas aparecem e trocam na conversa real do Chatwoot (cor, ordem, preservação das manuais) | CW-01, CW-02, CW-04 | exige uma instância Chatwoot real; os testes usam axios falso | 51-ROTEIRO-HOMOLOGACAO.md: troca de status de um orçamento de teste com conversa |
| Formato real de `created_at` das mensagens e de `status` em `GET conversations/:id` (premissa A3 do research) | CW-10 | exige a API real | roteiro: resolver, enviar mensagem do cliente e reabrir antes do prazo |
| Mensagem de encerramento sai entre 45 e 180 s depois e não duplica | CW-09 | exige tempo real e WhatsApp/Chatwoot reais | roteiro: resolver conversa liberada e cronometrar |
| Reinício do backend descarta a mensagem agendada, mantendo as etiquetas | CW-09 | exige reiniciar o container | roteiro, passo opcional de reinício; documentado em deploy/UPDATE_RUNBOOK.md |
| Revisão do diff: nenhum trecho específico de tenant (Box ou Bom Custo) | CW-12 | é um critério de revisão de código | revisar `git diff 810c059 -- apps/backend deploy` antes do verify-work |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (arquivos de teste novos são criados pela própria task, antes do código)
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter (definido pelo validate-phase depois da execução)

**Approval:** pending
