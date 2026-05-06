import { readFileSync, writeFileSync } from 'fs';

const servicePath = 'apps/backend/src/modules/quotes/quotes.service.ts';
let service = readFileSync(servicePath, 'utf8');

const guardRegex = /\/\/ APR-01\/02:[\s\S]*?if \(newStatus === "EM_PRODUCAO"\) \{[\s\S]*?\n\s*\}\n\s*const updated = await this\.prisma\.quote\.update\(\{/;
const guardReplacement = `// APR-01/02: Regras de entrada em EM_PRODUCAO
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
            "Falha ao verificar associacao Athos para bloqueio de producao no orcamento " +
              quote.id +
              ": " +
              (err instanceof Error ? err.message : String(err)),
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
    }
    const updated = await this.prisma.quote.update({`;

if (!guardRegex.test(service)) throw new Error('guard regex not found');
service = service.replace(guardRegex, guardReplacement);

service = service.replace(
  'let statusSyncError: string | null = null;',
  'let statusSyncError: string | null = null;\n    const paymentJustConfirmed = Boolean(payment.paid && !quote.paymentConfirmedAt);',
);

const loggerRegex = /\s*this\.logger\.log\(\n\s*`conciliacao_athos[\s\S]*?\n\s*\);/;
const loggerReplacement = `    if (paymentJustConfirmed) {
      try {
        await this.prisma.quote.update({
          where: { id: quote.id },
          data: { paymentConfirmedAt: new Date() },
        });
      } catch (error) {
        this.logger.warn(
          "Nao foi possivel persistir paymentConfirmedAt para o orcamento " +
            quote.id +
            ": " +
            (error instanceof Error ? error.message : String(error)),
        );
      }

      if (quote.conversationId) {
        try {
          const numero = quote.externalQuoteId ? Number(quote.externalQuoteId) : quote.internalNumber;
          const venda = resolvedIdVenda != null ? " (venda #" + resolvedIdVenda + ")" : "";
          await this.chatwootService.sendOutgoingMessage(
            String(quote.conversationId),
            "Pagamento confirmado no caixa para o orcamento #" + numero + venda + ". Obrigado!",
          );
        } catch (err) {
          this.logger.warn(
            "Falha ao notificar pagamento no caixa via Chatwoot para orcamento " +
              quote.id +
              ": " +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }
    }

    this.logger.log(
      \`conciliacao_athos quoteId=\${quote.id} paid=\${payment.paid} idVenda=\${resolvedIdVenda ?? "n/a"} valor=\${(payment as any).valor ?? 0} statusUpdated=\${statusUpdated} currentStatus=\${currentStatus}\`,
    );`;

if (!loggerRegex.test(service)) throw new Error('logger regex not found');
service = service.replace(loggerRegex, loggerReplacement);

service = service.replace(
  'paymentConfirmedAt: quote.paymentConfirmedAt ? quote.paymentConfirmedAt.toISOString() : null,\n      approved: Boolean(quote.approved ?? false),',
  'paymentConfirmedAt: quote.paymentConfirmedAt ? quote.paymentConfirmedAt.toISOString() : null,\n      saleExternalId: quote.saleExternalId ? Number(quote.saleExternalId) : null,\n      paidInCashier: Boolean(quote.saleExternalId),\n      approved: Boolean(quote.approved ?? false),',
);

writeFileSync(servicePath, service, 'utf8');

const pagePath = 'apps/frontend/src/app/orcamento/[id]/page.tsx';
let page = readFileSync(pagePath, 'utf8');

page = page.replace(
  'paymentConfirmedAt?: string | null;\n  approved?: boolean;',
  'paymentConfirmedAt?: string | null;\n  saleExternalId?: number | null;\n  paidInCashier?: boolean;\n  approved?: boolean;',
);

page = page.replace(
  '(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.approved)',
  '(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.saleExternalId || quote?.approved)',
);

page = page.replace(
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
);

writeFileSync(pagePath, page, 'utf8');

console.log('OK');
