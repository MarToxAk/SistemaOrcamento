---
phase: 45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail
verified: 2026-11-10T16:10:00Z
status: human_needed
score: 8/8 must-haves verified
covered_files:
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-01-PLAN.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-01-SUMMARY.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-02-PLAN.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-02-SUMMARY.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-03-PLAN.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-03-SUMMARY.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-04-PLAN.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-04-SUMMARY.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-05-PLAN.md"
  - ".planning/phases/45-aviso-de-boletos-a-vencer-e-atrasados-alerta-interno-e-mail/45-05-SUMMARY.md"
  - "apps/backend/prisma/schema.prisma"
  - "apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.ts"
  - "apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.service.ts"
  - "apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.util.ts"
  - "apps/backend/src/modules/cobranca/cobranca.controller.ts"
  - "apps/backend/src/modules/cobranca/cobranca.service.ts"
  - "apps/backend/src/modules/cobranca/email-envio.service.ts"
  - "apps/frontend/src/app/contas-receber/page.tsx"
covered_digest: "v4:sha256:31f2cc1720a37cd77e35d1a2eb77d47492e3082aee93b3aa0203684448322c1d"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Deploy em producao com COBRANCA_AVISO_ATIVO ausente/false; conferir que a migration 20261110120000_add_cobranca_aviso_vencimento foi aplicada (SELECT to_regclass('\"CobrancaAvisoVencimento\"'))"
    expected: "Tabela existe; log do backend as 08:00/14:00 mostra 'Aviso de vencimento desligado ... ciclo ignorado.'"
    why_human: "Deploy e banco de producao fora do alcance do verificador (45-ROTEIRO-ATIVACAO.md, Passo 0)"
  - test: "Abrir /contas-receber em producao (Passo 1 do roteiro)"
    expected: "Pills 'Vence em Nd' / 'Vence hoje' / 'Atrasado ha Nd' so em boletos pendentes; contadores 'A vencer' e 'Atrasados' batem com as pills; data de Sao Paulo (21:00-23:59 nao adianta o dia)"
    why_human: "Aparencia visual e dados reais de producao"
  - test: "Chamar GET /api/cobranca/aviso-vencimento/previa com x-internal-api-key e x-admin-api-key em producao (Passo 2)"
    expected: "dryRun=true, itens com e-mail mascarado, nenhuma linha em CobrancaAvisoVencimento criada, nenhum e-mail enviado; lista de quem receberia aviso confere com o esperado do negocio (atencao: na primeira ativacao boletos ja atrasados 2-20 dias entram numa janela)"
    why_human: "Exige chaves e Athos de producao; decisao de negocio sobre a lista"
  - test: "Dry-run agendado (COBRANCA_AVISO_ATIVO=true + COBRANCA_AVISO_DRY_RUN=true) e depois envio real em um boleto/cliente de teste (Passos 3-5)"
    expected: "Dry-run apenas loga; envio real entrega 1 e-mail ao cliente + CC com link e PDF; segunda execucao nao duplica; desligar volta a ignorar ciclos"
    why_human: "Envia e-mail real a clientes; ativacao e decisao do usuario (D-07). Plano 45-05 Task 2 (checkpoint:human-verify) permanece pendente por desenho"
---

# Phase 45: Aviso de boletos a vencer e atrasados - Verification Report

**Phase Goal:** Avisar sobre boletos (cobranca / Contas a Receber) proximos do vencimento e atrasados: alerta interno na tela e e-mail automatico ao cliente + CC (Fase 42), reutilizando email-envio.service. Lembrete 3 e 1 dia antes; atraso 2, 7 e 14 dias depois (max 3); cada aviso registrado sem duplicidade; pagos/cancelados nao geram aviso.
**Verified:** 2026-11-10
**Status:** human_needed (todo o codigo/gates automatizados passam; restam apenas as checagens de producao do plano 45-05)
**Re-verification:** Nao - verificacao inicial

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Calendario: 3 e 1 dia antes; 2, 7, 14 dias depois; max 3 de atraso (AVISO-01/02) | VERIFIED | `cobranca-aviso-vencimento.util.ts`: TIPOS_AVISO = D-3, D-1, A+2, A+7, A+14; JANELAS disjuntas D-3 {2..3}, D-1 {1}, A+2 {-6..-2}, A+7 {-13..-7}, A+14 {-20..-14}; `tipoAvisoAplicavel` devolve um unico tipo; dia 0 e fora das janelas = null. Janelas sao catch-up (D-05: so o aviso aplicavel mais recente, nunca varios). Apenas 3 tipos de atraso existem; depois de 20 dias so o alerta interno. Teste S3 do service cobre catch-up. |
| 2 | Destinatarios: cliente + CC Fase 42 (AVISO-03) | VERIFIED | `email-envio.service.ts` `resolverDestinatariosAviso`: primeiro e-mail valido entre emailcobrancacliente/emailcliente (SELECT Athos via `buscarDadosClienteContasReceber`) + `buscarCcPadrao`/`normalizarListaCc`; `enviarAvisoVencimento` envia `to` + `cc`, assunto "Lembrete: seu boleto vence amanha"/"Aviso: boleto vencido ha N dias", link http(s) + PDF best-effort. Tracer test cobre ponta a ponta. |
| 3 | Idempotencia: unique + sem duplicidade em falha SMTP (AVISO-04) | VERIFIED | schema `@@unique([cobrancaBoletoId, tipo])` + migration com `CREATE UNIQUE INDEX IF NOT EXISTS`; `reservar()` cria linha "enviando" ANTES de enviar, P2002 vira pulo; retomada so de status "erro" com tentativas < 3 por `updateMany` condicional; "enviando" nunca e retomada; `enviarAvisoVencimento` nao lanca se o registro em CobrancaEmailEnvio falhar apos o sendMail; falha no update de "enviado" apenas loga. Testes S9-S13. |
| 4 | Elegibilidade: so pendente, sem baixa (AVISO-04/06) | VERIFIED | `findMany` com `status: "pendente"`, janela de expireAt, `OR [athosBaixaStatus null, notIn baixado/ja_baixado]`; defesa dupla no laco; "hoje" por `hojeSaoPaulo`. Pago/cancelado/baixado nao entram. Teste S1/S7. Observacao: o pill do painel usa somente `status` (ver Info). |
| 5 | Kill switch padrao desligado (AVISO-08) | VERIFIED | Job: `config.get("COBRANCA_AVISO_ATIVO") !== "true"` -> ciclo ignorado; dry-run so com ATIVO=true; `@Cron("0 8,14 * * *", timeZone America/Sao_Paulo)`; guarda `running`. `docker-compose.vps.yml` e `docker-compose.box.vps.yml`: `${COBRANCA_AVISO_ATIVO:-false}`; `.env.example` e `deploy/stack.env.example`: `=false`. Nenhum arquivo versionado define `true`. |
| 6 | Alerta interno no dashboard / Contas a Receber (AVISO-05/06/07) | VERIFIED | `cobranca.service.ts` `buscarBoletosDashboard`: `hojeSaoPaulo`, `situacaoVencimento` (classificarVencimento, mesmo util do job), `ultimoAviso` via include aninhado; frontend `contas-receber/page.tsx`: pills "Vence em Nd"/"Vence hoje"/"Atrasado ha Nd", contadores "A vencer"/"Atrasados", linha de ultimo aviso incl. "Sem e-mail cadastrado". Rota proxy do dashboard repassa o JSON integral. `tsc` frontend OK. |
| 7 | Sem escrita no Athos | VERIFIED | Service so usa `prisma` (banco do Sistema) e `emailEnvio`; unico acesso ao Athos e `buscarDadosClienteContasReceber` (SELECT). `git diff 008ace6 HEAD` nao toca `integrations/athos`. Migration so cria tabela do Sistema. |
| 8 | Previa protegida e migration segura (AVISO-08, AVISO-01) | VERIFIED | `GET cobranca/aviso-vencimento/previa` com `@AdminOnly()`, sempre `processarCiclo({dryRun:true})`, e-mails mascarados, sem escrita. Migration aditiva com IF NOT EXISTS, FK ON DELETE CASCADE protegida por pg_constraint; `prisma validate` OK; `enviarBoletoENotas` inalterado (diff vs 008ace6 so adiciona 295 linhas, zero remocoes). |

**Score:** 8/8 truths verified (0 present-behavior-unverified)

### Gates executados pelo verificador

| Gate | Comando | Resultado |
|------|---------|-----------|
| Testes backend | `cd apps/backend && npx jest --no-coverage` | 61 suites passed, 892 passed, 10 skipped (esperado 892) |
| Tipos backend | `npx tsc --noEmit` | exit 0 |
| Tipos frontend | `cd apps/frontend && npx tsc --noEmit` | exit 0 |
| Schema | `prisma validate` (DATABASE_URL ficticia) | valido |

Testes especificos do aviso: util 6, job 7, service 16, tracer 4, controller 4 casos.

### Requirements Coverage

AVISO-01 a AVISO-08 (IDs locais da fase, definidos em 45-01-PLAN.md; nao constam em REQUIREMENTS.md) - todos com evidencia de codigo acima: 01/02 calendario, 03 destinatarios, 04 idempotencia/elegibilidade, 05/06/07 alerta interno e sem-email, 08 kill switch/previa/deploy. Nenhum requisito orfao.

### Anti-Patterns Found

Nenhum TBD/FIXME/XXX nos arquivos da fase. Sem stubs; dados do painel vem de consulta real.

| Severidade | Item |
|------------|------|
| Info | Pill do painel e contadores dependem so de `status = pendente`; o job tambem exclui `athosBaixaStatus` baixado/ja_baixado. Boleto pendente ja baixado no Athos (raro) poderia mostrar pill sem receber e-mail. Nao afeta o objetivo. |
| Info | Na primeira ativacao, boletos pendentes ja atrasados entre 2 e 20 dias recebem o aviso da janela correspondente (teto 100 envios/ciclo). Mitigado pelo roteiro (previa e dry-run antes do envio real). |

### Human Verification Required

Itens de producao do plano 45-05 (Task 2, checkpoint:human-verify) - NAO sao gaps; o executor/verificador nao pode e nao deve ativar o envio (D-07):

1. **Deploy + migration com envio desligado** - Passo 0 do roteiro. Esperado: tabela existe e log "Aviso de vencimento desligado".
2. **Painel em producao** - Passo 1. Esperado: pills/contadores coerentes, data de Sao Paulo.
3. **Previa em producao** - Passo 2. Esperado: lista mascarada, nada gravado nem enviado; conferir lista de destinatarios.
4. **Dry-run e envio real controlado, depois desligar** - Passos 3-6. Esperado: sem duplicidade, CC recebido, PDF/link no e-mail.

### Gaps Summary

Nenhum gap de implementacao. Todos os criterios do ROADMAP e decisoes D-01..D-08 estao implementados, ligados e cobertos por testes verdes; o envio permanece desligado por padrao. Resta apenas a verificacao humana em producao, por desenho da fase.

---

_Verified: 2026-11-10_
_Verifier: Claude (gsd-verifier)_
