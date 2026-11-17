---
phase: "50"
slug: "contas-a-receber-boleto-atualizado-com-juros-e-multa"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-17"
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 30 + ts-jest 29 (backend). Frontend sem framework de teste: `tsc` + `next build` + `<human-check>` |
| **Config file** | `apps/backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`) |
| **Quick run command** | `npm --prefix apps/backend run test -- cobranca-boleto-atualizado --no-coverage` |
| **Full suite command** | `npm --prefix apps/backend run test -- --no-coverage` (baseline em ec3199e: 75 suítes, 1081 passed, 28 skipped) |
| **Typecheck / build** | `npx tsc --noEmit -p apps/backend/tsconfig.json`, `npx tsc --noEmit -p apps/frontend/tsconfig.json`, `npm --prefix apps/frontend run build` |
| **Estimated runtime** | ~50 segundos (suíte completa do backend); teste de arquivo < 15 s |

---

## Sampling Rate

- **After every task commit:** rodar o teste do arquivo tocado (`npm --prefix apps/backend run test -- <padrão> --no-coverage`) + `npx tsc --noEmit -p apps/backend/tsconfig.json` (tarefas de frontend: `npx tsc --noEmit -p apps/frontend/tsconfig.json`)
- **After every plan wave:** `npm --prefix apps/backend run test -- --no-coverage` + `npx tsc --noEmit -p apps/frontend/tsconfig.json`
- **Before `/gsd-verify-work`:** suíte backend completa verde, `tsc` backend+frontend com 0 erros, `next build` sem falha, migration aplicada e reaplicada no Postgres descartável (50-07) e homologação D-17 aprovada
- **Max feedback latency:** 50 seconds
- **Segurança dos testes:** nenhum teste toca EFI, Athos ou banco reais (axios/pg/Prisma falsos); validação real só no clone `athos-teste` (127.0.0.1:5440) e no banco descartável 127.0.0.1:5450

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | BA-01, BA-02, BA-05, BA-09 | T-50-01..T-50-07 | corpo só com data e taxas; 401 sem chave; criar -> persistir -> cancelar estrito; nada apagado; migration só gerada/validada | tracer HTTP | `npm --prefix apps/backend run test -- cobranca-boleto-atualizado.http --no-coverage` | ❌ W0 (criado na própria task) | ⬜ pending |
| 50-01-02 | 01 | 1 | BA-01, BA-02, BA-09 | T-50-02 | tetos e datas puros; mensagem EFI ASCII <= 4x100 | unit (puro) | `npm --prefix apps/backend run test -- cobranca-boleto-atualizado.util cobranca.service.emissao-efi --no-coverage` | ❌ W0 | ⬜ pending |
| 50-02-01 | 02 | 1 | BA-06 | T-50-08, T-50-10 | baixa com snapshot sem ler conf_financeiro; divergência sem escrita | tracer (pg mockado) | `npm --prefix apps/backend run test -- cobranca-baixa-athos.boleto-atualizado.tracer --no-coverage` | ❌ W0 | ⬜ pending |
| 50-02-02 | 02 | 1 | BA-06, BA-09 | T-50-08, T-50-09, T-50-11 | pagamento atrasado só até o teto pós-vencimento; REC idempotente; boleto comum intacto | unit | `npm --prefix apps/backend run test -- athos-conta-receber-baixa athos-baixa-encargos cobranca-baixa-athos --no-coverage` | parcial (arquivos existem; casos novos ❌) | ⬜ pending |
| 50-03-01 | 03 | 2 | BA-01, BA-03 | T-50-15 | prévia sem EFI e sem escrita; 400 para data/teto/campo extra | HTTP | `npm --prefix apps/backend run test -- cobranca-boleto-atualizado.http --no-coverage` | ✅ (de 50-01) | ⬜ pending |
| 50-03-02 | 03 | 2 | BA-05, BA-08 | T-50-12, T-50-13 | sucessor ativo sem novo charge; mutex 409; compensação do charge órfão; 4600210 | unit | `npm --prefix apps/backend run test -- cobranca-boleto-atualizado --no-coverage` | ❌ W0 | ⬜ pending |
| 50-04-01 | 04 | 2 | BA-04 | T-50-16..T-50-19 | GET/PUT AdminOnly; tetos no DTO e no serviço; chaves só no servidor | unit + tsc | `npm --prefix apps/backend run test -- cobranca-encargos-config --no-coverage && npx tsc --noEmit -p apps/frontend/tsconfig.json` | ❌ W0 | ⬜ pending |
| 50-04-02 | 04 | 2 | BA-04 | — | menu em grupo; /configuracoes redireciona | build + human-check | `npm --prefix apps/frontend run build` | n/a (frontend) | ⬜ pending |
| 50-05-01 | 05 | 2 | BA-07 | T-50-20 | mensagem escapada no e-mail; boleto comum igual | tracer unit (nodemailer mockado) | `npm --prefix apps/backend run test -- email-envio --no-coverage` | ✅ (casos novos ❌) | ⬜ pending |
| 50-05-02 | 05 | 2 | BA-10 | T-50-21..T-50-23 | alerta sem cancelar nada; webhook nunca cai | unit | `npm --prefix apps/backend run test -- cobranca.service --no-coverage` | ✅ (casos novos ❌) | ⬜ pending |
| 50-06-01 | 06 | 3 | BA-01, BA-03, BA-07, BA-08 | T-50-24..T-50-26 | proxies com sessão e chaves permitidas; só datas do servidor; guarda de duplo clique | tsc + build + human-check | `npx tsc --noEmit -p apps/frontend/tsconfig.json && npm --prefix apps/frontend run build` | n/a (frontend) | ⬜ pending |
| 50-06-02 | 06 | 3 | BA-10 | T-50-27 | alerta de pagamento em dobro visível | tsc + build + human-check | `npx tsc --noEmit -p apps/frontend/tsconfig.json && npm --prefix apps/frontend run build` | n/a (frontend) | ⬜ pending |
| 50-07-01 | 07 | 4 | BA-11 | T-50-28..T-50-30 | migration real só em 127.0.0.1:5450; nenhum host de produção | gates + migration real | `npm --prefix apps/backend run test -- --no-coverage` + `docker exec orcamento-homolog-fase50 psql ...` (ver plano) | n/a | ⬜ pending |
| 50-07-02 | 07 | 4 | BA-11 | T-50-29, T-50-30 | homologação D-17 só no clone athos-teste | manual (blocking-human) | ver 50-ROTEIRO-HOMOLOGACAO.md | n/a | ⬜ pending |
| 50-07-03 | 07 | 4 | BA-11 | T-50-31 | liberação só com decisão humana registrada | decisão (blocking-human) | — | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requisitos locais da fase (definidos no planejamento)

| ID | Descrição | Decisões | Planos |
|----|-----------|----------|--------|
| BA-01 | Novo vencimento só hoje (São Paulo) ou próximo dia útil seg-sex, no backend e no frontend | D-01, D-02 | 50-01, 50-03, 50-06 |
| BA-02 | Juros pro rata (taxa/30 x dias x principal) e multa fixa por título desde a datavencimento do Athos | D-03, D-04, D-05, D-13 | 50-01 |
| BA-03 | Taxas editáveis na geração, pré-preenchidas, com tetos 1% a.m. / 2% | D-06, D-16 | 50-03, 50-06 |
| BA-04 | Tela /configuracoes/cobranca (PasswordGate/AdminShell + menu) com taxas padrão persistidas e tetos | D-07, D-16, D-18 | 50-04 |
| BA-05 | Novo boleto EFI com linhas de juros e multa; criar -> persistir -> cancelar original estrito, marcado cancelado, com vínculo | D-08, D-11, D-14 | 50-01, 50-03 |
| BA-06 | Baixa Athos do título original com juros e multa do snapshot como encargos | D-09 | 50-02 |
| BA-07 | Envio pelo e-mail existente com CC, com a mensagem informativa | D-10, D-12 | 50-05, 50-06 |
| BA-08 | Bloquear boleto pago/cancelado/baixado/sem vencidos; detalhamento antes de confirmar | discrição | 50-03, 50-06 |
| BA-09 | configurations.fine/interest pós-vencimento com as taxas padrão + mensagem na EFI; baixa aceita pagamento atrasado do atualizado | D-12 | 50-01, 50-02 |
| BA-10 | Pagamento do original cancelado só gera alerta (log + tela), sem cancelar o novo | D-15 | 50-05, 50-06 |
| BA-11 | Checkpoint humano de homologação (boleto real de valor baixo; baixa só no clone athos-teste) antes de produção | D-17 | 50-07 |

---

## Wave 0 Requirements

- [ ] `apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.http.test.ts` — tracer HTTP de BA-01/02/05/09 (50-01 T1, escrito antes do código)
- [ ] `apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.util.test.ts` — BA-01/02/09 puros (50-01 T2)
- [ ] `apps/backend/src/modules/cobranca/cobranca.service.emissao-efi.test.ts` — helper `prepararEmissaoEfi` (50-01 T2)
- [ ] `apps/backend/src/modules/cobranca/cobranca-baixa-athos.boleto-atualizado.tracer.test.ts` — BA-06 (50-02 T1)
- [ ] `apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.test.ts` — BA-05/08 (50-03 T2)
- [ ] `apps/backend/src/modules/cobranca/cobranca-encargos-config.test.ts` — BA-04 (50-04 T1)
- [ ] `npm --prefix apps/backend run prisma:generate` depois de editar o schema (senão ts-jest falha de tipo) — 50-01 T1
- Nenhum framework a instalar; frontend segue sem framework de teste (tsc + build + human-check, como nas Fases 45-48).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boleto real na EFI: vencimento "hoje" aceito (A3), nomes dos itens aceitos (A5b), mensagem e configurations visíveis no painel, original cancelado | BA-05, BA-09, BA-11 | exige a API real da EFI (testes nunca chamam EFI) | 50-ROTEIRO-HOMOLOGACAO.md, passos de geração e conferência no painel EFI |
| Baixa no Athos grava juros/multa/atraso aceitos pelo banco (A5) | BA-06, BA-11 | exige Postgres 9.0.5 do Athos; só no clone athos-teste | roteiro: pagar, "Verificar", SELECT em conta_recebida no clone |
| E-mail recebido com o quadro "Boleto atualizado" e CC | BA-07 | SMTP real | roteiro: enviar ao próprio operador |
| Tela de taxas, menu, modal de atualização e lista de boletos | BA-01, BA-03, BA-04, BA-08, BA-10 | frontend sem framework de teste | itens `<human-check>` de 50-04 e 50-06 |
| Migration aplicada de verdade e idempotente | BA-05, BA-09 | exige Postgres | 50-07 T1 no banco descartável 127.0.0.1:5450 (automatizado pelo executor) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (exceto os dois checkpoints humanos de 50-07)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (arquivos de teste novos são criados pela própria task, antes do código)
- [x] No watch-mode flags
- [x] Feedback latency < 50s
- [ ] `nyquist_compliant: true` set in frontmatter (definido pelo validate-phase depois da execução)

**Approval:** pending
