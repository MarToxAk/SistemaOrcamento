import { readFileSync, writeFileSync } from 'fs';

function replaceOrThrow(content, before, after, label) {
  if (!content.includes(before)) {
    throw new Error(`Nao encontrou trecho para ${label}`);
  }
  return content.replace(before, after);
}

// -------------------- backend service --------------------
const servicePath = 'apps/backend/src/modules/quotes/quotes.service.ts';
let service = readFileSync(servicePath, 'utf8');

const guardOld = `// APR-01/02: Regras de entrada em EM_PRODUCAO
    // - Cliente associado Athos: exige aprovacao via link (approved=true)
    // - Cliente nao associado: exige pagamento confirmado (approved=true ou saleExternalId)
    if (newStatus === "EM_PRODUCAO") {
      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);
      const hasSaleId = quote.saleExternalId != null;
      const hasApproval = Boolean(quote.approved);

      if (isAssociated && !hasApproval) {
        throw new BadRequestException(
          "Cliente associado ao Athos aguardando aprovacao via link. A aprovacao do cliente e obrigatoria antes de entrar em producao.",
        );
      }

      if (!isAssociated && !hasApproval && !hasSaleId) {
        throw new BadRequestException(
          "Orcamento aguardando confirmacao de pagamento. Confirme o pagamento (PIX, pix parcial, cartao ou caixa) antes de entrar em producao.",
        );
      }
    }`;

const guardNew = `// APR-01/02: Regras de entrada em EM_PRODUCAO
    // - Cliente associado Athos (ou com fluxo de aprovacao por link): exige approved=true
    // - Cliente nao associado: exige pagamento confirmado (approved=true ou saleExternalId)
    if (newStatus === "EM_PRODUCAO") {
      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);
      const hasSaleId = quote.saleExternalId != null;
      const hasApproval = Boolean(quote.approved);

      let requiresLinkApproval =
        isAssociated || Boolean((quote as any).approvalRequestedAt || quote.approvalToken || quote.approvalExpiresAt);

      // Fallback: se o cadastro local nao vier marcado como associado, consulta o Athos por idcliente
      if (!requiresLinkApproval && quote.externalQuoteId) {
        try {
          const athosData = await this.athosService.buscarOrcamentoPorNumero(String(Number(quote.externalQuoteId)));
          const mapped = (athosData as any)?.mapped ?? null;
          requiresLinkApproval = Boolean(mapped?.idcliente ?? mapped?.clienteid);
        } catch (err) {
          this.logger.debug(
            `Falha ao verificar associacao Athos para bloqueio de producao no orcamento ${quote.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (requiresLinkApproval && !hasApproval) {
        throw new BadRequestException(
          "Cliente associado ao Athos aguardando aprovacao via link. A aprovacao do cliente e obrigatoria antes de entrar em producao.",
        );
      }

      if (!requiresLinkApproval && !hasApproval && !hasSaleId) {
        throw new BadRequestException(
          "Orcamento aguardando confirmacao de pagamento. Confirme o pagamento (PIX, pix parcial, cartao ou caixa) antes de entrar em producao.",
        );
      }
    }`;

service = replaceOrThrow(service, guardOld, guardNew, 'guard EM_PRODUCAO');

const statusSyncAnchor = `    let statusUpdated = false;
    let previousStatus = quote.status;
    let currentStatus = quote.status;
    let statusSyncError: string | null = null;`;

const statusSyncWithPaymentMark = `    let statusUpdated = false;
    let previousStatus = quote.status;
    let currentStatus = quote.status;
    let statusSyncError: string | null = null;
    const paymentJustConfirmed = Boolean(payment.paid && !quote.paymentConfirmedAt);`;

service = replaceOrThrow(service, statusSyncAnchor, statusSyncWithPaymentMark, 'paymentJustConfirmed flag');

const beforeLogger = `    this.logger.log(
      ` + "`conciliacao_athos quoteId=${quote.id} paid=${payment.paid} idVenda=${resolvedIdVenda ?? \"n/a\"} valor=${(payment as any).valor ?? 0} statusUpdated=${statusUpdated} currentStatus=${currentStatus}`" + `,
    );`;

const withPaymentActions = `    if (paymentJustConfirmed) {
      try {
        await this.prisma.quote.update({
          where: { id: quote.id },
          data: { paymentConfirmedAt: new Date() },
        });
      } catch (error) {
        this.logger.warn(
          `Nao foi possivel persistir paymentConfirmedAt para o orcamento ${quote.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      if (quote.conversationId) {
        try {
          const numero = quote.externalQuoteId ? Number(quote.externalQuoteId) : quote.internalNumber;
          const venda = resolvedIdVenda != null ? ` (venda #${resolvedIdVenda})` : "";
          await this.chatwootService.sendOutgoingMessage(
            String(quote.conversationId),
            `✅ Pagamento confirmado no caixa para o orçamento #${numero}${venda}. Obrigado!`,
          );
        } catch (err) {
          this.logger.warn(
            `Falha ao notificar pagamento no caixa via Chatwoot para orcamento ${quote.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    this.logger.log(
      ` + "`conciliacao_athos quoteId=${quote.id} paid=${payment.paid} idVenda=${resolvedIdVenda ?? \"n/a\"} valor=${(payment as any).valor ?? 0} statusUpdated=${statusUpdated} currentStatus=${currentStatus}`" + `,
    );`;

service = replaceOrThrow(service, beforeLogger, withPaymentActions, 'payment confirmation side effects');

const mapTopAnchor = `      paymentConfirmedAt: quote.paymentConfirmedAt ? quote.paymentConfirmedAt.toISOString() : null,
      approved: Boolean(quote.approved ?? false),`;

const mapTopNew = `      paymentConfirmedAt: quote.paymentConfirmedAt ? quote.paymentConfirmedAt.toISOString() : null,
      saleExternalId: quote.saleExternalId ? Number(quote.saleExternalId) : null,
      paidInCashier: Boolean(quote.saleExternalId),
      approved: Boolean(quote.approved ?? false),`;

service = replaceOrThrow(service, mapTopAnchor, mapTopNew, 'mapQuoteBody saleExternalId exposure');

writeFileSync(servicePath, service, 'utf8');

// -------------------- frontend page --------------------
const pagePath = 'apps/frontend/src/app/orcamento/[id]/page.tsx';
let page = readFileSync(pagePath, 'utf8');

page = replaceOrThrow(
  page,
`  paymentConfirmedAt?: string | null;
  approved?: boolean;`,
`  paymentConfirmedAt?: string | null;
  saleExternalId?: number | null;
  paidInCashier?: boolean;
  approved?: boolean;`,
  'QuoteDetail type fields'
);

page = replaceOrThrow(
  page,
`          {(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.approved) && (`,
`          {(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.saleExternalId || quote?.approved) && (`,
  'integration badges condition'
);

page = replaceOrThrow(
  page,
`              {quote?.paymentConfirmedAt && (
                <span className="badge bg-primary">
                  <i className="bi bi-check-circle me-1" />PIX Confirmado
                </span>
              )}`,
`              {quote?.saleExternalId && (
                <span className="badge bg-success">
                  <i className="bi bi-cash-coin me-1" />Pago no Caixa - Venda #{quote.saleExternalId}
                </span>
              )}
              {!quote?.saleExternalId && quote?.paymentConfirmedAt && (
                <span className="badge bg-primary">
                  <i className="bi bi-check-circle me-1" />Pagamento Confirmado
                </span>
              )}`,
  'payment badge rendering'
);

writeFileSync(pagePath, page, 'utf8');

console.log('OK');
