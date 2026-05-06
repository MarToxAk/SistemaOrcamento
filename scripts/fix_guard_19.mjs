import { readFileSync, writeFileSync } from 'fs';

const path = 'apps/backend/src/modules/quotes/quotes.service.ts';
let content = readFileSync(path, 'utf8');
const CRLF = content.includes('\r\n');
const NL = CRLF ? '\r\n' : '\n';
function ln(s) { return CRLF ? s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : s; }

const oldGuard = `// APR-01/02/03: Bloqueia EM_PRODUCAO sem associacao Athos valida e sem pagamento confirmado
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
    }`;

const newGuard = `// APR-01: Sem associacao Athos exige pagamento confirmado (PIX, cartao ou caixa)
    // Clientes associados avancam livremente (link de aprovacao e enviado separadamente)
    if (newStatus === "EM_PRODUCAO") {
      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);
      const hasSaleId = quote.saleExternalId != null;
      const hasApproval = Boolean(quote.approved);

      if (!isAssociated && !hasApproval && !hasSaleId) {
        throw new BadRequestException(
          "Orcamento aguardando confirmacao de pagamento. Confirme o pagamento (PIX, cartao ou caixa) antes de entrar em producao.",
        );
      }
    }`;

const idxLF = content.indexOf(oldGuard);
const idxCRLF = content.indexOf(oldGuard.replace(/\n/g, '\r\n'));
const found = idxCRLF !== -1 ? idxCRLF : idxLF;
if (found === -1) { console.error('Guard not found'); process.exit(1); }

const oldLen = idxCRLF !== -1 ? oldGuard.replace(/\n/g, '\r\n').length : oldGuard.length;
content = content.substring(0, found) + ln(newGuard) + content.substring(found + oldLen);
console.log('Guard fixed');

writeFileSync(path, content, 'utf8');
console.log('Done');
