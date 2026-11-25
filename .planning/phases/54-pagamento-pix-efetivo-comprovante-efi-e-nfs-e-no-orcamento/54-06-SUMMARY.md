---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 06
subsystem: nfse
tags: [nfse, pagamento, trava, senha-liberacao, auditoria, tdd]
requires: ["54-01", "54-05"]
provides:
  - trava de pagamento integral em emitirQuoteNfseAutomatica (403 PAGAMENTO_INTEGRAL_NAO_CONFIRMADO)
  - teto do valorServico (422 VALOR_ACIMA_DO_PAGO)
  - liberacao por senha com auditoria fail-closed em NfseLiberacao e limitador de forca bruta (429 LIBERACAO_BLOQUEADA)
  - GET quotes/:quoteId/nfse/pagamento (NfseService.resolverPagamentoQuote)
affects: [54-07, 54-08]
tech-stack:
  added: []
  patterns: ["decisao de pagamento so no backend", "auditoria gravada antes do ato fiscal (fail-closed)"]
key-files:
  created:
    - apps/backend/src/modules/integrations/nfse/nfse.service.pagamento.test.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.liberacao.test.ts
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.controller.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.identificador.test.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts
key-decisions:
  - "A trava roda depois da checagem de nfseNumero e antes de resolverTomadorQuote (Athos) e da SEFIN."
  - "Falha ao gravar a linha LIBERADO aborta a emissao com 500 LIBERACAO_NAO_AUDITADA; as demais saidas auditam em best-effort."
  - "Senha esperada em branco (so espacos) tambem conta como nao configurada."
  - "Quando a situacao e INTEGRAL (PIX ou caixa) a senha do corpo e ignorada: sem consulta a env, sem auditoria, sem limitador."
status: complete
metrics:
  duration: "~35 min"
  completed: 2026-11-25
commits: 3
plan_head_before: bd4fd31096789760e881a98d4713f1066147a08e
plan_head_after: da328457218516fd8e903376c54b879f7e44602b
actuals:
  tokens: 19000
  tasks: 3
  commits: 3
---

# Phase 54 Plan 06: Trava de pagamento e liberacao por senha na NFS-e do orcamento Summary

Emissao automatica de NFS-e do orcamento agora so acontece com pagamento integral (PIX ja com desconto, tolerancia R$ 0,02) ou confirmado no caixa; fora disso exige senha unica da empresa, validada no backend em tempo constante, com auditoria gravada antes de emitir e bloqueio por forca bruta. A tela ganha o endpoint de leitura do pagamento identificado.

## O que foi feito

- **Tarefa 1 (TDD, 00d566b):** `verificarTravaPagamento` em `emitirQuoteNfseAutomatica`, logo depois do `nfseNumero` e antes do Athos/SEFIN. INTEGRAL libera; teto em centavos (`VALOR_ACIMA_DO_PAGO`, D-15: PIX = valor pago, caixa = devido); nao integral sem senha = 403 com situacao/valores. `anexarQuoteNfse` e `removerQuoteNfse` intactos (D-16). Tres testes existentes migrados para `quoteIntegralSemDesconto(250)` sem tocar em assercoes.
- **Tarefa 2 (TDD, 6608972):** `liberarPorSenha`: `liberadoPor` obrigatorio (400), limitador por IP (5) e global (20) em 15 min (429), env ausente/vazia sempre nega (403 `LIBERACAO_NAO_CONFIGURADA`), `senhaConfere` (sha256 + timingSafeEqual), falha conta nos dois limitadores, sucesso limpa o IP, teto, e linha `NfseLiberacao` LIBERADO gravada antes de emitir (fail-closed) e atualizada com o `nfseNumero` depois (best-effort). Controller repassa `x-client-ip`/`x-client-user-agent` (fallback `user-agent` e socket) via `resolverIpOperador`, user-agent truncado em 200. Nova assinatura `emitirQuoteNfseAutomatica(quoteId, dto, contexto = {})`.
- **Tarefa 3 (TDD, da32845):** `GET quotes/:quoteId/nfse/pagamento`. Resposta = `resolverSituacaoPagamentoQuote` + `pagoEm` + `pagamentos[{e2eId, txid, valor, pagoEm, metodo}]` (ordem cronologica) + `pagamentoCaixa`. `pagoEm` vem do `horario` do webhook (metadata ou payload, se valido) ou de `processedAt`; no caixa, de `paymentConfirmedAt`.

## Verificacao

- `jest src/modules/integrations/nfse src/modules/cobranca`: 39 suites, 496 testes verdes (Contas a Receber intacto).
- Suite completa do backend: 112 suites passando, 2 skipped, 1863 testes verdes.
- `tsc -p tsconfig.json --noEmit` em `apps/backend`: limpo.
- Nenhuma emissao real na SEFIN nem consulta ao Athos de producao (tudo mockado). Nenhuma senha real em codigo/teste/env: os literais dos testes sao obviamente falsos; teste afirma que a senha nao aparece em nenhum `create`/`update`/logger.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Ambiente] node_modules ausente no worktree**
- Symlinks locais nao versionados (`node_modules`, `apps/backend/node_modules`) para o repo principal; `prisma generate` com DATABASE_URL falsa; `tsc` e `jest` rodados direto em `apps/backend` do worktree (o `npm exec -w @orcamento/backend` apontaria para o repo principal). Os symlinks aparecem como untracked e NAO foram commitados.

**2. [Rule 2 - Critico] Falha da auditoria LIBERADO vira 500 com code**
- O plano diz "erro propagado"; em vez do erro cru do Prisma, lanca `InternalServerErrorException({ code: "LIBERACAO_NAO_AUDITADA" })` para a tela diferenciar. Emissao igualmente abortada.

**3. [Observacao] Ledger do plano**
- Nao gravado em `.git` do worktree (sandbox); base registrada no frontmatter (`bd4fd31`) e `commits` medido com `git rev-list --count bd4fd31..HEAD` (3 antes do commit deste SUMMARY).

Fora isso, o plano foi executado como escrito.

## Pontos de atencao para os planos seguintes

- **54-07/54-08 (front/proxy do Next):** o IP do operador so chega correto se o route handler de `quotes/[id]/nfse/emitir` repassar `x-client-ip` (e `x-client-user-agent`) ao backend; sem isso a auditoria e o limitador usam o IP do socket (o do proxy), e todos os operadores dividem o mesmo limite de 5 falhas. O DTO ja aceita `senhaLiberacao` e `liberadoPor`.
- **Achado do 54-01:** `resolverSituacaoPagamentoQuote` classifica INTEGRAL/CAIXA quando `paymentConfirmedAt` esta preenchido. Se o webhook (54-02) gravar `paymentConfirmedAt` em PIX parcial (entrada 50%), a trava e o GET passariam a tratar como integral por caixa. Esta trava depende de o webhook gravar `paymentConfirmedAt` somente na quitacao (o codigo atual de `efi.service.ts` ja faz isso: `fullyPaid ? new Date() : atual`). Validar no merge com o 54-02.
- **Leitura legada:** orcamentos como o #26809 gravados antes da fase (paymentDiscount 0, paidTotal 164,35) caem em PARCIAL ate a reconciliacao (54-10); ate la so liberam por senha.
- Variavel `NFSE_OVERRIDE_PASSWORD` precisa ser definida no ambiente (nome ja em `NFSE_OVERRIDE_ENV`); sem ela a liberacao por senha e sempre negada.
- STATE.md e ROADMAP.md nao foram atualizados (worktree paralelo; fica com o orquestrador).

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do threat_model do plano (T-54-16 a T-54-19 mitigados/aceitos como previsto).

## Self-Check: PASSED

- Arquivos existem: nfse.service.ts, nfse.controller.ts, nfse.service.pagamento.test.ts, nfse.service.liberacao.test.ts.
- Commits 00d566b, 6608972 e da32845 presentes no historico.
