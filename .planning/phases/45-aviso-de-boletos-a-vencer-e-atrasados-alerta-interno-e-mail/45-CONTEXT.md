# Phase 45: Aviso de boletos a vencer e atrasados - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning
**Mode:** Decisoes do usuario (chat) + analise do codigo; smart-discuss dispensado

<domain>
## Phase Boundary

Avisar sobre boletos (modulo `cobranca`, Contas a Receber) proximos do vencimento e atrasados:
(a) alerta interno na tela e (b) e-mail automatico ao cliente + CC. Nao altera emissao, baixa no Athos nem reconciliacao EFI.
</domain>

<decisions>
## Implementation Decisions

### Canais (D-01)
- **D-01:** Alerta interno na tela **e** e-mail automatico (os dois).

### Calendario de avisos (D-02, D-03)
- **D-02 (antes do vencimento):** 2 avisos — **3 dias antes** e **1 dia antes** de `expireAt`.
- **D-03 (atraso):** 3 avisos — **2, 7 e 14 dias depois** de `expireAt`. Maximo 3 avisos de atraso; depois disso so o alerta interno continua.
- Tipos de aviso (chave de idempotencia): `D-3`, `D-1`, `A+2`, `A+7`, `A+14`.
- Dia do vencimento nao gera e-mail (nao pedido).

### Destinatarios (D-04)
- Cliente **e** CC. Destinatario principal = `emailcobrancacliente || emailcliente` do Athos (mesma regra de `EmailEnvioService.enviarBoletoENotas`). CC = `CobrancaEmailCcPadrao.emails` do cliente (Fase 42), normalizado por `normalizarListaCc`.
- Cliente sem e-mail valido: nao envia, registra log/alerta interno ("sem e-mail"), sem repetir erro a cada ciclo.
- Reutilizar `EmailEnvioService` (transporte nodemailer, template, CC, registro em `CobrancaEmailEnvio`). Novo metodo de aviso no mesmo servico; nao duplicar logica SMTP.

### Idempotencia (D-05)
- Nova tabela Prisma `CobrancaAvisoVencimento` (`cobrancaBoletoId`, `tipo`, `enviadoEm`, `status`/erro, `destinatario`), com `@@unique([cobrancaBoletoId, tipo])`. Reservar a linha antes de enviar; falha de SMTP marca erro e permite nova tentativa no ciclo seguinte (mesma janela), sem duplicar aviso ja enviado.
- Catch-up: se o job ficar parado, enviar apenas o aviso mais recente aplicavel por boleto (nunca varios de uma vez), e pular tipos cuja janela ja passou.

### Elegibilidade (D-06)
- Somente `CobrancaBoleto.status = "pendente"` com `expireAt` valido. Boleto pago, cancelado ou com baixa (`athosBaixaStatus` baixado/ja_baixado) nao gera aviso. Datas em America/Sao_Paulo (YYYY-MM-DD, sem fuso do servidor).

### Execucao (D-07)
- Job `@nestjs/schedule` diario (ex.: 08:00 America/Sao_Paulo), no padrao de `cobranca-reconciliation.job.ts` (guarda `running`, teto por ciclo, logs).
- **Kill switch** `COBRANCA_AVISO_ATIVO` (padrao **desligado**: so envia com `=true`), mais modo "dry-run" opcional que apenas loga. Motivo: envia e-mail real a clientes; ativacao em producao e decisao do usuario.

### Alerta interno (D-08)
- `buscarBoletosDashboard()` ja devolve `diasParaVencer`. Adicionar destaque no dashboard e em Contas a Receber: "Vence em Nd" (<=3), "Vence hoje", "Atrasado ha Nd"; contadores de a vencer / atrasados; indicar ultimo aviso enviado por boleto. Seguir design system Bom Custo (skill `bom-custo-design`).

### Claude's Discretion
Texto/assunto do e-mail (portugues, tom cordial, sem emojis), anexar PDF do boleto ou so o link, nomes de arquivos/DTOs, layout exato dos badges.
</decisions>

<code_context>
## Existing Code Insights

- `apps/backend/prisma/schema.prisma`: `CobrancaBoleto` (`expireAt` String YYYY-MM-DD, `status`, `athosBaixaStatus`), `CobrancaEmailEnvio` (com `cc`), `CobrancaEmailCcPadrao`.
- `apps/backend/src/modules/cobranca/email-envio.service.ts`: `enviarBoletoENotas`, `normalizarListaCc`, `buscarCcPadrao`.
- `cobranca-reconciliation.job.ts` / `cobranca-baixa-athos-retry.job.ts`: padrao de Cron + guarda `running`.
- `cobranca.service.ts` `buscarBoletosDashboard()` (~l.870): ja calcula `diasParaVencer`; consumido por `apps/frontend/src/app/api/cobranca/boleto/dashboard/route.ts` e `apps/frontend/src/app/contas-receber/`.
- Testes: vitest/jest ao lado dos servicos (`*.test.ts`); migracoes Prisma em `apps/backend/prisma`.
- Restricao: Athos de producao nunca recebe escrita de teste; esta fase nao escreve no Athos.
</code_context>

<specifics>
## Specific Ideas

- Avisos: 3 dias e 1 dia antes; 2, 7 e 14 dias depois. Sem duplicidade.
</specifics>

<deferred>
## Deferred Ideas

- Aviso por WhatsApp/Chatwoot; aviso no dia do vencimento; configuracao do calendario pela interface.
</deferred>
