import { readFileSync, writeFileSync } from 'fs';

const path = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';
let content = readFileSync(path, 'utf8');
const CRLF = content.includes('\r\n');
const NL = CRLF ? '\r\n' : '\n';
function ln(s) { return CRLF ? s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : s; }

// Replace all 4 guard-related tests with correct semantics
const oldBlock = `    it("deve lancar BadRequestException ao tentar EM_PRODUCAO sem aprovacao e sem associado", async () => {
      // ambos faltando: mensagem menciona "sem associacao" (primeiro check)
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(
        "sem associacao",
      );
    });

    it("deve lancar BadRequestException com mensagem clara quando associado mas sem pagamento confirmado", async () => {
      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null, customer: assocCustomer }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(
        "sem pagamento",
      );
    });

    it("deve permitir EM_PRODUCAO quando associado e aprovado", async () => {
      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, customer: assocCustomer }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    });

    it("deve permitir EM_PRODUCAO quando associado e tem saleExternalId", async () => {
      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: BigInt(42), customer: assocCustomer }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    });`;

const newBlock = `    it("deve lancar BadRequestException ao tentar EM_PRODUCAO sem associacao e sem pagamento", async () => {
      // Sem isAssociated E sem pagamento (approved=false, saleExternalId=null): bloqueia
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(
        "confirmacao de pagamento",
      );
    });

    it("deve permitir EM_PRODUCAO quando cliente associado sem pagamento (associado avanca livremente)", async () => {
      // isAssociated=true: nao precisa de pagamento confirmado
      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null, customer: assocCustomer }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    });

    it("deve permitir EM_PRODUCAO sem associacao quando tem approved=true", async () => {
      // Sem isAssociated mas com pagamento aprovado: libera
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, saleExternalId: null }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO" }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    });

    it("deve permitir EM_PRODUCAO sem associacao quando tem saleExternalId (pagamento no caixa Athos)", async () => {
      // Sem isAssociated mas com saleExternalId: libera
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: BigInt(42) }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO" }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    });`;

const idxCRLF = content.indexOf(oldBlock.replace(/\n/g, '\r\n'));
const idxLF = content.indexOf(oldBlock);
const found = idxCRLF !== -1 ? idxCRLF : idxLF;
if (found === -1) { console.error('Old test block not found'); process.exit(1); }

const oldLen = idxCRLF !== -1 ? oldBlock.replace(/\n/g, '\r\n').length : oldBlock.length;
content = content.substring(0, found) + ln(newBlock) + content.substring(found + oldLen);
console.log('Tests fixed');

writeFileSync(path, content, 'utf8');
console.log('Done');
