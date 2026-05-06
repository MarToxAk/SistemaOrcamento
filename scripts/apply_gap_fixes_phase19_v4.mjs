import { readFileSync, writeFileSync } from 'fs';

const servicePath = 'apps/backend/src/modules/quotes/quotes.service.ts';
let s = readFileSync(servicePath, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

const guardStart = s.indexOf('// APR-01/02: Regras de entrada em EM_PRODUCAO');
const guardEndMarker = `${nl}    const updated = await this.prisma.quote.update({`;
const guardEnd = s.indexOf(guardEndMarker, guardStart);
if (guardStart < 0 || guardEnd < 0) throw new Error('guard markers not found');

const newGuard = [
  '// APR-01/02: Regras de entrada em EM_PRODUCAO',
  '    // - Cliente associado Athos (ou com fluxo de aprovacao por link): exige approved=true',
  '    // - Cliente nao associado: exige pagamento confirmado (approved=true ou saleExternalId)',
  '    if (newStatus === "EM_PRODUCAO") {',
  '      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);',
  '      const hasSaleId = quote.saleExternalId != null;',
  '      const hasApproval = Boolean(quote.approved);',
  '',
  '      let requiresLinkApproval =',
  '        isAssociated || Boolean((quote as any).approvalRequestedAt || quote.approvalToken || quote.approvalExpiresAt);',
  '',
  '      // Fallback: se o cadastro local nao vier marcado como associado, consulta o Athos por idcliente',
  '      if (!requiresLinkApproval && quote.externalQuoteId) {',
  '        try {',
  '          const athosData = await this.athosService.buscarOrcamentoPorNumero(String(Number(quote.externalQuoteId)));',
  '          const mapped = (athosData as any)?.mapped ?? null;',
  '          requiresLinkApproval = Boolean(mapped?.idcliente ?? mapped?.clienteid);',
  '        } catch (err) {',
  '          this.logger.debug(',
  '            "Falha ao verificar associacao Athos para bloqueio de producao no orcamento " +',
  '              quote.id +',
  '              ": " +',
  '              (err instanceof Error ? err.message : String(err)),',
  '          );',
  '        }',
  '      }',
  '',
  '      if (requiresLinkApproval && !hasApproval) {',
  '        throw new BadRequestException(',
  '          "Cliente associado ao Athos aguardando aprovacao via link. A aprovacao do cliente e obrigatoria antes de entrar em producao.",',
  '        );',
  '      }',
  '',
  '      if (!requiresLinkApproval && !hasApproval && !hasSaleId) {',
  '        throw new BadRequestException(',
  '          "Orcamento aguardando confirmacao de pagamento. Confirme o pagamento (PIX, pix parcial, cartao ou caixa) antes de entrar em producao.",',
  '        );',
  '      }',
  '    }',
].join(nl);

s = s.slice(0, guardStart) + newGuard + s.slice(guardEnd);

s = s.replace(
  'let statusSyncError: string | null = null;',
  'let statusSyncError: string | null = null;' + nl + '    const paymentJustConfirmed = Boolean(payment.paid && !quote.paymentConfirmedAt);',
);

const logStart = s.indexOf('this.logger.log(' + nl + '      `conciliacao_athos quoteId=${quote.id} paid=${payment.paid}');
if (logStart < 0) throw new Error('log start not found');
const logEnd = s.indexOf('    );', logStart);
if (logEnd < 0) throw new Error('log end not found');
const afterLog = logEnd + '    );'.length;

const logBlockNew = [
  'if (paymentJustConfirmed) {',
  '      try {',
  '        await this.prisma.quote.update({',
  '          where: { id: quote.id },',
  '          data: { paymentConfirmedAt: new Date() },',
  '        });',
  '      } catch (error) {',
  '        this.logger.warn(',
  '          "Nao foi possivel persistir paymentConfirmedAt para o orcamento " +',
  '            quote.id +',
  '            ": " +',
  '            (error instanceof Error ? error.message : String(error)),',
  '        );',
  '      }',
  '',
  '      if (quote.conversationId) {',
  '        try {',
  '          const numero = quote.externalQuoteId ? Number(quote.externalQuoteId) : quote.internalNumber;',
  '          const venda = resolvedIdVenda != null ? " (venda #" + resolvedIdVenda + ")" : "";',
  '          await this.chatwootService.sendOutgoingMessage(',
  '            String(quote.conversationId),',
  '            "Pagamento confirmado no caixa para o orcamento #" + numero + venda + ". Obrigado!",',
  '          );',
  '        } catch (err) {',
  '          this.logger.warn(',
  '            "Falha ao notificar pagamento no caixa via Chatwoot para orcamento " +',
  '              quote.id +',
  '              ": " +',
  '              (err instanceof Error ? err.message : String(err)),',
  '          );',
  '        }',
  '      }',
  '    }',
  '',
  '    this.logger.log(',
  '      `conciliacao_athos quoteId=${quote.id} paid=${payment.paid} idVenda=${resolvedIdVenda ?? "n/a"} valor=${(payment as any).valor ?? 0} statusUpdated=${statusUpdated} currentStatus=${currentStatus}`,' ,
  '    );',
].join(nl);

s = s.slice(0, logStart) + logBlockNew + s.slice(afterLog);

s = s.replace(
  'paymentConfirmedAt: quote.paymentConfirmedAt ? quote.paymentConfirmedAt.toISOString() : null,' + nl + '      approved: Boolean(quote.approved ?? false),',
  'paymentConfirmedAt: quote.paymentConfirmedAt ? quote.paymentConfirmedAt.toISOString() : null,' + nl + '      saleExternalId: quote.saleExternalId ? Number(quote.saleExternalId) : null,' + nl + '      paidInCashier: Boolean(quote.saleExternalId),' + nl + '      approved: Boolean(quote.approved ?? false),',
);

writeFileSync(servicePath, s, 'utf8');

const pagePath = 'apps/frontend/src/app/orcamento/[id]/page.tsx';
let p = readFileSync(pagePath, 'utf8');

p = p.replace(
  'paymentConfirmedAt?: string | null;\n  approved?: boolean;',
  'paymentConfirmedAt?: string | null;\n  saleExternalId?: number | null;\n  paidInCashier?: boolean;\n  approved?: boolean;',
);

p = p.replace(
  '(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.approved)',
  '(quote?.latestPdfUrl || quote?.nfseNumero || quote?.paymentConfirmedAt || quote?.saleExternalId || quote?.approved)',
);

p = p.replace(
  '{quote?.paymentConfirmedAt && (\n                <span className="badge bg-primary">\n                  <i className="bi bi-check-circle me-1" />PIX Confirmado\n                </span>\n              )}',
  '{quote?.saleExternalId && (\n                <span className="badge bg-success">\n                  <i className="bi bi-cash-coin me-1" />Pago no Caixa - Venda #{quote.saleExternalId}\n                </span>\n              )}\n              {!quote?.saleExternalId && quote?.paymentConfirmedAt && (\n                <span className="badge bg-primary">\n                  <i className="bi bi-check-circle me-1" />Pagamento Confirmado\n                </span>\n              )}',
);

writeFileSync(pagePath, p, 'utf8');

console.log('OK');
