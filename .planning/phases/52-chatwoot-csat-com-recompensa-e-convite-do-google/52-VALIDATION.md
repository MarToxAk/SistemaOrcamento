---
phase: "52"
slug: "chatwoot-csat-com-recompensa-e-convite-do-google"
# status lifecycle: draft (seeded by plan-phase) -> validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TBD | TBD | TBD | Token 24 bytes hex, unico, expira | — | Gera 48 hex; expirado recusado | unit | `jest pesquisa-regras -t token` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Nota 1-5, comentario <= 500 | — | Rejeita 0, 6, texto | unit | `jest pesquisa-regras -t nota` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Variante A/B gravada | — | 50/50 com rnd injetado; gravada no envio | unit | `jest pesquisa-regras -t variante` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Input_csat privado com content_type | — | POST com `private: true, content_type: "input_csat"` | unit (mock axios) | `jest chatwoot-csat.service` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PUT publico com submitted_values | — | Corpo exato; sem api token | unit | `jest chatwoot-csat.service -t submit` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Uma pesquisa com Chatwoot por conversa | — | Segunda pesquisa marca NAO_APLICAVEL e nao cria input_csat | unit | `jest pesquisa.service -t segunda` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Chatwoot falha nao bloqueia | — | Resposta e cupom gravados mesmo com 500 no PUT | unit | `jest pesquisa.service -t best-effort` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Cupom unico por pesquisa | — | `pesquisaId` unico; segunda emissao nao cria | unit (Prisma mock) + migracao | `jest pesquisa.service -t cupom` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Cupom de uso unico | — | Dois resgates simultaneos: um 200 e um 409 | unit (mock de updateMany) | `jest pesquisa-cupom -t resgate` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Desconto = min(%, teto, compra), centavos, arredonda para baixo | — | Casos: R$ 6 Box 10%, R$ 30 Bom Custo, R$ 0,01 | unit | `jest pesquisa-regras -t desconto` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Compra minima | — | Abaixo do minimo: 422 | unit | `jest pesquisa-cupom -t minimo` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Teto mensal (emissao e resgate) | — | Emissao bloqueada no teto; resgate bloqueado se passar (Q4) | unit | `jest pesquisa-cupom -t teto` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Mes em America/Sao_Paulo | — | 01/12 01:00 UTC = novembro | unit | `jest pesquisa-regras -t mes` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Intervalo 90 dias por telefone | — | Segundo cupom antes de 90 dias: sem recompensa | unit | `jest pesquisa.service -t intervalo` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Convite Google para todos | — | Convite enviado com nota 1 e com nota 5 | unit | `jest pesquisa.service -t convite` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Convite sem referencia a cupom | — | Texto do convite nao contem codigo nem "cupom" | unit (checagem de template) | `jest pesquisa-regras -t convite` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SAIR normalizado | — | "sair", "Sair!", " SAIR " = verdadeiro; "sair por favor" = falso | unit | `jest pesquisa-regras -t optout` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SAIR suprime pesquisa e convite, nao servico | — | Supressao gravada; closing sem bloco; mensagens de servico seguem | unit | `jest pesquisa-webhook -t supressao` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | HMAC valido/invalido/expirado | — | Assinatura certa aceita; errada e fora da janela recusadas | unit | `jest pesquisa-webhook -t hmac` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Webhook filtra incoming e private=false | — | Mensagem privada propria nao dispara nada | unit | `jest pesquisa-webhook -t filtro` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Re-check com historico (corrige P5) | — | Resposta do cliente antes de atividade e detectada | unit | `jest chatwoot-etiquetas -t reavaliacao` (estender)` | ✅ | ⬜ pending |
| TBD | TBD | TBD | Labels sem perda (P6, P7) | — | `avaliou` preservada em mesclagem; POST na fila | unit | `jest chatwoot-etiquetas -t mescla` | ✅ | ⬜ pending |
| TBD | TBD | TBD | Rota publica sem limite global (P8) | — | Metadado `SkipThrottle` presente; limite por token | unit | `jest pesquisa-public -t limite` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Retencao 12 meses | — | Anonimiza linhas > 12 meses; mantem agregados | unit | `jest pesquisa-retencao` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Kill-switch | — | `ativo=false` nao cria pesquisa nem envia bloco | unit | `jest pesquisa.service -t ativo` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Telefone normalizado | — | `+5512996484918`, `(12) 99648-4918`, `12996484918` -> mesma chave | unit | `jest pesquisa-regras -t telefone` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Link Google allowlist | — | Dominio fora da lista recusado no DTO | unit | `jest pesquisa-admin -t linkGoogle` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts` — funcoes puras (token, codigo, desconto, telefone, opt-out, mes, variante, validacao de nota).
- [ ] `apps/backend/src/modules/pesquisa/pesquisa.service.test.ts` — criacao, resposta, cupom, teto, intervalo, convite, best-effort, kill-switch (mocks de Prisma e ChatwootService com os metodos novos).
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-cupom.test.ts` — resgate atomico, minimo, teto no resgate.
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.test.ts` — HMAC, janela, filtro, SAIR.
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-public.controller.test.ts` — limite por token e metadado de throttle.
- [ ] `apps/backend/src/modules/pesquisa/pesquisa-retencao.test.ts` — anonimizacao.
- [ ] `apps/backend/src/modules/integrations/chatwoot/chatwoot-csat.service.test.ts` — payloads de `createPrivateCsatMessage`, `submitCsatResponse`, `listMessagesAfter`, `updateContactCustomAttributes`, `createAccountLabel` (corpo aninhado).
- [ ] Atualizar `chatwoot-automation.service.test.ts:147` e `chatwoot-fechamento-agendado.test.ts:72` se o construtor mudar (P3).
- [ ] Estender `chatwoot-etiquetas.test.ts` para a reavaliacao com historico (P5).
- [ ] Frontend: nenhuma biblioteca nova sem passar pelo gate de pacotes. Cobertura por `next build` e roteiro.

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
