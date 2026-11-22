---
phase: "52"
slug: "chatwoot-csat-com-recompensa-e-convite-do-google"
# status lifecycle: draft (seeded by plan-phase) -> validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-22"
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 52-RESEARCH.md "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29 (backend). Frontend sem runner (cobertura por `next build` + roteiro) |
| **Config file** | `apps/backend/jest.config.js` |
| **Quick run command** | `cd /root/SistemaOrcamento/apps/backend && ../../node_modules/.bin/jest src/modules/pesquisa src/modules/integrations/chatwoot --no-coverage` |
| **Full suite command** | `cd /root/SistemaOrcamento && npm --workspace @orcamento/backend run test` |
| **Build** | `cd /root/SistemaOrcamento && npm run build` |
| **Estimated runtime** | ~60 seconds (quick), ~180 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (files touched)
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite + `npm run build` must be green; roteiro de homologacao assinado
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table maps CONTEXT decisions to the verification each covering task must carry.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | Token 24 bytes hex, unico, expira | — | Gera 48 hex; expirado recusado | unit | `jest pesquisa-regras -t token` | ✅ | ✅ green |
| TBD | TBD | TBD | Nota 1-5, comentario <= 500 | — | Rejeita 0, 6, texto | unit | `jest pesquisa-regras -t nota` | ✅ | ✅ green |
| TBD | TBD | TBD | Variante A/B gravada | — | 50/50 com rnd injetado; gravada no envio | unit | `jest pesquisa-regras -t variante` | ✅ | ✅ green |
| TBD | TBD | TBD | Input_csat privado com content_type | — | POST com `private: true, content_type: "input_csat"` | unit (mock axios) | `jest chatwoot-csat.service` | ✅ | ✅ green |
| TBD | TBD | TBD | PUT publico com submitted_values | — | Corpo exato; sem api token | unit | `jest chatwoot-csat.service -t submit` | ✅ | ✅ green |
| TBD | TBD | TBD | Uma pesquisa com Chatwoot por conversa | — | Segunda pesquisa marca NAO_APLICAVEL e nao cria input_csat | unit | `jest pesquisa.service -t segunda` | ✅ | ✅ green |
| TBD | TBD | TBD | Chatwoot falha nao bloqueia | — | Resposta e cupom gravados mesmo com 500 no PUT | unit | `jest pesquisa.service -t best-effort` | ✅ | ✅ green |
| TBD | TBD | TBD | Cupom unico por pesquisa | — | `pesquisaId` unico; segunda emissao nao cria | unit (Prisma mock) + migracao | `jest pesquisa.service -t cupom` | ✅ | ✅ green |
| TBD | TBD | TBD | Cupom de uso unico | — | Dois resgates simultaneos: um 200 e um 409 | unit (mock de updateMany) | `jest pesquisa-cupom -t resgate` | ✅ | ✅ green |
| TBD | TBD | TBD | Desconto = min(%, teto, compra), centavos, arredonda para baixo | — | Casos: R$ 6 Box 10%, R$ 30 Bom Custo, R$ 0,01 | unit | `jest pesquisa-regras -t desconto` | ✅ | ✅ green |
| TBD | TBD | TBD | Compra minima | — | Abaixo do minimo: 422 | unit | `jest pesquisa-cupom -t minimo` | ✅ | ✅ green |
| TBD | TBD | TBD | Teto mensal (emissao e resgate) | — | Emissao bloqueada no teto; resgate bloqueado se passar (Q4) | unit | `jest pesquisa-cupom -t teto` | ✅ | ✅ green |
| TBD | TBD | TBD | Mes em America/Sao_Paulo | — | 01/12 01:00 UTC = novembro | unit | `jest pesquisa-regras -t mes` | ✅ | ✅ green |
| TBD | TBD | TBD | Intervalo 90 dias por telefone | — | Segundo cupom antes de 90 dias: sem recompensa | unit | `jest pesquisa.service -t intervalo` | ✅ | ✅ green |
| TBD | TBD | TBD | Convite Google para todos | — | Convite enviado com nota 1 e com nota 5 | unit | `jest pesquisa.service -t convite` | ✅ | ✅ green |
| TBD | TBD | TBD | Convite sem referencia a cupom | — | Texto do convite nao contem codigo nem "cupom" | unit (checagem de template) | `jest pesquisa-regras -t convite` | ✅ | ✅ green |
| TBD | TBD | TBD | SAIR normalizado | — | "sair", "Sair!", " SAIR " = verdadeiro; "sair por favor" = falso | unit | `jest pesquisa-regras -t optout` | ✅ | ✅ green |
| TBD | TBD | TBD | SAIR suprime pesquisa e convite, nao servico | — | Supressao gravada; closing sem bloco; mensagens de servico seguem | unit | `jest pesquisa-webhook -t supressao` | ✅ | ✅ green |
| TBD | TBD | TBD | HMAC valido/invalido/expirado | — | Assinatura certa aceita; errada e fora da janela recusadas | unit | `jest pesquisa-webhook -t hmac` | ✅ | ✅ green |
| TBD | TBD | TBD | Webhook filtra incoming e private=false | — | Mensagem privada propria nao dispara nada | unit | `jest pesquisa-webhook -t filtro` | ✅ | ✅ green |
| TBD | TBD | TBD | Re-check com historico (corrige P5) | — | Resposta do cliente antes de atividade e detectada | unit | `jest chatwoot-etiquetas -t reavaliacao` (estender)` | ✅ | ✅ green |
| TBD | TBD | TBD | Labels sem perda (P6, P7) | — | `avaliou` preservada em mesclagem; POST na fila | unit | `jest chatwoot-etiquetas -t mescla` | ✅ | ✅ green |
| TBD | TBD | TBD | Rota publica sem limite global por IP (P8, D-37) | — | Metadado `SkipThrottle` presente; limites por IP real, por token e teto da rota (300/min) | unit | `jest pesquisa.tracer` (T10 e T15) | ✅ | ✅ green |
| TBD | TBD | TBD | Retencao 12 meses (colunas nulaveis, grava NULL) | — | Anonimiza linhas > 12 meses gravando NULL em telefone, conversationId, contactId, conversationUuid, customerId e comentario; mantem agregados | unit | `jest pesquisa-jobs -t anonimiza` | ✅ | ✅ green |
| TBD | TBD | TBD | Kill-switch | — | `ativo=false` nao cria pesquisa nem envia bloco | unit | `jest pesquisa.service -t ativo` | ✅ | ✅ green |
| TBD | TBD | TBD | Telefone normalizado | — | `+5512996484918`, `(12) 99648-4918`, `12996484918` -> mesma chave | unit | `jest pesquisa-regras -t telefone` | ✅ | ✅ green |
| TBD | TBD | TBD | Link Google allowlist | — | Dominio fora da lista recusado no DTO | unit | `jest pesquisa-admin -t linkGoogle` | ✅ | ✅ green |
| TBD | TBD | TBD | Revogar pesquisa (token revogavel, CONTEXT rev. 1) | — | Apos revogar, rota publica responde INDISPONIVEL com corpo generico (mesmo de token inexistente); cupom EMITIDO vira CANCELADO; USADO intacto; idempotente; id invalido 404 | unit | `jest pesquisa-revogacao` | ✅ | ✅ green |
| TBD | TBD | TBD | IP real so com chave interna valida (revisao do arquiteto, D-37) | — | `x-client-ip` ignorado sem `x-internal-api-key` valida; inundacao de tokens aleatorios recebe 429 sem acesso ao banco | unit | `jest pesquisa.tracer -t T15` | ✅ | ✅ green |
| TBD | TBD | TBD | Proxy publico fora do prefixo de API (nginx roteia /api/ ao backend) | — | POST /pesquisa/[token]/responder chega ao proxy do Next e devolve 404 JSON INDISPONIVEL para token inexistente | manual | roteiro 52-11, passo 7 (curl no dominio publico) | Roteiro | ⬜ pending |
| TBD | TBD | TBD | Reserva antes de enviar (ENVIANDO) | — | Dois ciclos simultaneos enviam uma vez; envio incerto so reenvia apos 15 min e depois de conferir a mensagem no Chatwoot | unit | `jest pesquisa-mensagens -t reserva` | ✅ | ✅ green |
| TBD | TBD | TBD | input_csat nao duplicada e guarda do CSAT nativo | — | Re-tentativa reutiliza input_csat existente (lista com internas); inbox com CSAT nativo ligado vira NAO_APLICAVEL com aviso | unit | `jest pesquisa-mensagens -t csat` e `jest pesquisa.tracer -t T14` | ✅ | ✅ green |
| TBD | TBD | TBD | Dupla despedida (envio, registro, gancho) | — | ChatwootMensagemEnviada gravada antes do gancho; falha na gravacao nao impede o gancho | unit | `jest pesquisa.tracer -t T13` | ✅ | ✅ green |
| TBD | TBD | TBD | Corrida revogar x responder | — | Cupom criado apos a revogacao e cancelado (CANCELADO) e a resposta devolve cupom nulo | unit | `jest pesquisa.service -t corrida` e `jest pesquisa-revogacao -t corrida` | ✅ | ✅ green |
| TBD | TBD | TBD | Trava advisory dos crons | — | Sem a trava (outro processo) o ciclo e pulado; timeout 15 min; chaves 520101 e 520102 | unit | `jest pesquisa-jobs -t trava` | ✅ | ✅ green |
| TBD | TBD | TBD | Contrato de messages.list verificado (after exclusivo, ate 100, filter_internal_messages por blank) | — | incluirInternas omite o parametro; lista de 100 itens vira indeterminada no re-check | unit | `jest chatwoot-csat.service -t listMessagesAfter` e `jest chatwoot-fechamento-agendado -t Truncamento` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts` — funcoes puras (token, codigo, desconto, telefone, opt-out, mes, variante, validacao de nota).
- [x] `apps/backend/src/modules/pesquisa/pesquisa.service.test.ts` — criacao, resposta, cupom, teto, intervalo, convite, best-effort, kill-switch (mocks de Prisma e ChatwootService com os metodos novos).
- [x] `apps/backend/src/modules/pesquisa/pesquisa-cupom.test.ts` — resgate atomico, minimo, teto no resgate.
- [x] `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.test.ts` — HMAC, janela, filtro, SAIR.
- [x] `apps/backend/src/modules/pesquisa/pesquisa.tracer.test.ts` — limites da rota publica (por IP real, token e teto), metadado de throttle e IP confiavel so com a chave interna.
- [x] `apps/backend/src/modules/pesquisa/pesquisa-jobs.test.ts` — jobs de retry e retencao, trava advisory e anonimizacao com NULL.
- [x] `apps/backend/src/modules/pesquisa/pesquisa-revogacao.service.test.ts` — revogacao de pesquisa (INDISPONIVEL ponta a ponta com PesquisaService real, CANCELADO, idempotencia, convite agendado cancelado).
- [x] `apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts` — payloads de `createPrivateCsatMessage`, `submitCsatResponse`, `getInbox`, `listMessagesAfter` (com e sem `incluirInternas`) e `updateContactCustomAttributes` (sem criacao de etiqueta de conta: passo manual do roteiro).
- [x] Atualizar `chatwoot-automation.service.test.ts:147` e `chatwoot-fechamento-agendado.test.ts:72` se o construtor mudar (P3).
- [x] Estender `chatwoot-etiquetas.test.ts` para a reavaliacao com historico (P5).
- [x] Frontend: nenhuma biblioteca nova sem passar pelo gate de pacotes. Cobertura por `next build` e roteiro.

---

## Accepted Gaps

- Frontend sem runner de testes (decisao registrada no CONTEXT): tarefas de frontend usam `tsc --noEmit` + `npm --workspace @orcamento/frontend run build` no verify; regras puras do frontend (validarConfigCliente, linkGoogleSeguro, renderizarPrevia, mensagemErroEnvio) cobertas por build + passos do roteiro de homologacao. Backstops de UI (320 px, barra de gasto vs teto, paginacao > 50 cupons) tem passo dedicado no roteiro de 52-11.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Carrega com token valido; mensagem generica com invalido | Pagina publica (proxy, UI) | Depende de Chatwoot/WhatsApp reais (homologacao) ou de UI sem runner | `npm --workspace @orcamento/frontend run build` + roteiro |
| `GET /api/v1/accounts/:id/csat_survey_responses` mostra a nota de teste | Relatorio nativo recebe a nota | Depende de Chatwoot/WhatsApp reais (homologacao) ou de UI sem runner | roteiro abaixo |
| Conversa de teste sem mensagem extra no WhatsApp | Nada chega ao cliente pelo input_csat privado (A1) | Depende de Chatwoot/WhatsApp reais (homologacao) ou de UI sem runner | roteiro abaixo |
| `csat_survey_enabled = false` em todas as inboxes WhatsApp | CSAT nativo desligado (P1) | Depende de Chatwoot/WhatsApp reais (homologacao) ou de UI sem runner | `SELECT id, csat_survey_enabled FROM inboxes` (somente leitura) |

### Roteiro de homologacao (manual; so em Chatwoot de teste - Q1)
1. Desligar `csat_survey_enabled` nas inboxes WhatsApp de teste (confirmar por leitura).
2. Criar as etiquetas `avaliou` e `csat-baixo` na conta de teste (admin, corpo `{ "label": { ... } }`).
3. Com `PESQUISA_ATIVA=true`, fechar uma conversa de teste ligada a um orcamento de teste.
4. Conferir que o WhatsApp de teste recebeu a mensagem de fechamento com um link, e que nao recebeu nenhuma outra mensagem com link.
5. Abrir o link, enviar nota 2 com comentario. Conferir: nota privada na conversa; etiquetas `avaliou` e `csat-baixo`; atributos do contato.
6. Aguardar alguns segundos e conferir `GET /api/v1/accounts/:id/csat_survey_responses` e a tela `/app/accounts/:id/reports/csat` (nota 2 e comentario).
7. Conferir que a mensagem privada `input_csat` NAO apareceu no WhatsApp de teste.
8. Enviar "SAIR" pelo WhatsApp de teste. Conferir supressao e que a conversa reabriu (esperado).
9. Repetir o fechamento: conferir que nao ha segunda `input_csat` (Q2) e que a pesquisa nova so existe no nosso banco.
10. Registrar o resultado (conversation id, nota, horario) no roteiro.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (quick 60s; full suite 23s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-22 — 16 test files present, full backend suite green (1648 testes / 99 suites).

## Validation Audit 2026-11-22

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
