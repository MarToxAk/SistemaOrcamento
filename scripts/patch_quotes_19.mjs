import { readFileSync, writeFileSync } from 'fs';

const path = 'apps/backend/src/modules/quotes/quotes.service.ts';
let content = readFileSync(path, 'utf8');

// Detect line ending
const CRLF = content.includes('\r\n');
const NL = CRLF ? '\r\n' : '\n';

function ln(s) {
  return CRLF ? s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : s;
}

// === CHANGE 1: Replace payment check in getById ===
const marker1 = 'if (["PENDENTE", "ENVIADO"].includes(resolvedQuote.status))';
const idx1 = content.indexOf(marker1);
if (idx1 === -1) { console.error('CHANGE 1: marker not found'); process.exit(1); }

// Find the end of this if block: look for the closing } followed by blank line
const blockEnd1Raw = content.indexOf(NL + '    }' + NL, idx1);
const blockEnd1 = blockEnd1Raw + NL.length + '    }'.length;
const oldBlock1 = content.substring(idx1, blockEnd1);
console.log('CHANGE 1 block start:', JSON.stringify(oldBlock1.substring(0, 60)));

const newBlock1 = ln(`// ATHC-01: verificar pagamento via relacao_orcamento_venda quando orcamento tem ID Athos
    if (resolvedQuote.externalQuoteId) {
      void this.conciliarViaCaixaAthos(resolvedQuote).catch((err: unknown) => {
        this.logger.warn(
          \`Conciliacao Caixa Athos falhou para orcamento \${resolvedQuote.id}: \${err instanceof Error ? err.message : String(err)}\`,
        );
      });
    } else if (["PENDENTE", "ENVIADO"].includes(resolvedQuote.status)) {
      void this.checkPaymentStatus(resolvedQuote.id).catch((err: unknown) => {
        this.logger.warn(
          \`Disparo de checagem de pagamento falhou para orcamento \${resolvedQuote.id}: \${err instanceof Error ? err.message : String(err)}\`,
        );
      });
    }`);

content = content.substring(0, idx1) + newBlock1 + content.substring(blockEnd1);
console.log('Change 1 applied');

// === CHANGE 2: Replace EM_PRODUCAO guard ===
const throwMarker = '\u00d3r\u00e7amento precisa ser aprovado pelo cliente antes de entrar em produ\u00e7\u00e3o';
const throwIdx = content.indexOf('"Or\u00e7amento precisa ser aprovado pelo cliente antes de entrar em produ\u00e7\u00e3o"');
if (throwIdx === -1) { console.error('CHANGE 2: throw marker not found'); process.exit(1); }

// Find comment start  
const commentStart = content.lastIndexOf(NL + '    // ', throwIdx) + NL.length;
// Find end of the outer if block  
const outerClose = content.indexOf(NL + '    }', throwIdx) + NL.length + '    }'.length;
const oldGuard = content.substring(commentStart, outerClose);
console.log('CHANGE 2 block start:', JSON.stringify(oldGuard.substring(0, 60)));

const newGuard = ln(`// APR-01/02/03: Bloqueia EM_PRODUCAO sem associacao Athos valida e sem pagamento confirmado
    if (newStatus === "EM_PRODUCAO") {
      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);
      const hasSaleId = quote.saleExternalId != null;
      const hasApproval = Boolean(quote.approved);

      if (!isAssociated && !hasApproval && !hasSaleId) {
        throw new BadRequestException(
          "Orcamento sem associacao com cliente Athos e sem pagamento confirmado. Associe o orcamento e verifique o pagamento antes de entrar em producao.",
        );
      }
      if (!isAssociated) {
        throw new BadRequestException(
          "Orcamento sem associacao com cliente Athos valido. Associe o orcamento a um idcliente antes de entrar em producao.",
        );
      }
      if (!hasApproval && !hasSaleId) {
        throw new BadRequestException(
          "Orcamento sem pagamento confirmado. Verifique o pagamento no Caixa Athos antes de entrar em producao.",
        );
      }
    }`);

content = content.substring(0, commentStart) + newGuard + content.substring(outerClose);
console.log('Change 2 applied');

// === CHANGE 3: Add conciliarViaCaixaAthos method after checkPaymentStatus ===
const marker3 = 'quoteId: quote.id,';
const idx3 = content.indexOf(marker3);
if (idx3 === -1) { console.error('CHANGE 3: marker not found'); process.exit(1); }

const returnClose3 = content.indexOf(NL + '    };' + NL + '  }', idx3);
if (returnClose3 === -1) { console.error('CHANGE 3: return close not found'); process.exit(1); }
const insertPoint = returnClose3 + NL.length + '    };'.length + NL.length + '  }'.length;

const conciliarMethod = ln(`

  private async conciliarViaCaixaAthos(quote: any): Promise<void> {
    const idOrcamento = Number(quote.externalQuoteId);
    if (!Number.isFinite(idOrcamento) || idOrcamento <= 0) return;

    // ATHC-02: Buscar vinculo idorcamento -> idvenda em relacao_orcamento_venda
    const relacao = await this.athosService.buscarRelacaoOrcamentoVenda(idOrcamento);

    // TRG-02: Idempotencia - persistir saleExternalId apenas se ainda nao definido
    if (relacao.idvenda != null && !quote.saleExternalId) {
      try {
        await this.prisma.quote.update({
          where: { id: quote.id },
          data: { saleExternalId: this.toBigInt(relacao.idvenda) },
        });
        this.logger.log(
          \`conciliarViaCaixaAthos: saleExternalId=\${relacao.idvenda} persistido para orcamento \${quote.id}\`,
        );
      } catch (err) {
        this.logger.warn(
          \`conciliarViaCaixaAthos: falha ao persistir saleExternalId para \${quote.id}: \${err instanceof Error ? err.message : String(err)}\`,
        );
      }
    }

    // TRG-01/TRG-03: Acionar mesma rotina de conciliacao de PIX/cartao para status pendentes
    if (["PENDENTE", "ENVIADO"].includes(quote.status)) {
      await this.checkPaymentStatus(quote.id);
    }
  }`);

content = content.substring(0, insertPoint) + conciliarMethod + content.substring(insertPoint);
console.log('Change 3 applied');

writeFileSync(path, content, 'utf8');
console.log('Done. File size:', Buffer.byteLength(content, 'utf8'));
