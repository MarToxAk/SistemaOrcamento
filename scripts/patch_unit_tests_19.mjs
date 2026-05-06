import { readFileSync, writeFileSync } from 'fs';

const path = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';
let content = readFileSync(path, 'utf8');

const CRLF = content.includes('\r\n');
const NL = CRLF ? '\r\n' : '\n';
function ln(s) { return CRLF ? s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : s; }

// === CHANGE 1: Update existing "precisa ser aprovado" test + add new tests ===
const oldTest = `    it("deve lancar BadRequestException ao tentar EM_PRODUCAO sem aprovacao e sem associado", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false }));
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);
      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(
        "precisa ser aprovado",
      );
    });`;

const idx = content.indexOf(oldTest.replace(/\n/g, NL));
const idxLF = content.indexOf(oldTest);
const found = idx !== -1 ? idx : idxLF;
if (found === -1) {
  console.error('Old test not found');
  // Debug: search for partial
  const partial = 'precisa ser aprovado';
  const pIdx = content.indexOf(partial);
  console.log('Partial "precisa ser aprovado" at:', pIdx);
  if (pIdx > 0) console.log('Context:', JSON.stringify(content.substring(pIdx-100, pIdx+100)));
  process.exit(1);
}

const oldTestActual = content.substring(found, found + Math.max(oldTest.length, oldTest.replace(/\n/g, '\r\n').length) + 20);
// Find the actual end of the test block by looking for closing });
const testEnd = content.indexOf('    });', found) + '    });'.length;
const oldTestBlock = content.substring(found, testEnd);
console.log('Old test block found, length:', oldTestBlock.length);

const newTests = ln(`    it("deve lancar BadRequestException ao tentar EM_PRODUCAO sem aprovacao e sem associado", async () => {
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
    });`);

content = content.substring(0, found) + newTests + content.substring(testEnd);
console.log('Change 1 applied');

// === CHANGE 2: Update AthosService mock to include buscarRelacaoOrcamentoVenda ===
const oldAthosMock = `{ provide: AthosService, useValue: { buscarOrcamentoPorNumero: jest.fn(), testarConexao: jest.fn() } }`;
const newAthosMock = `{ provide: AthosService, useValue: { buscarOrcamentoPorNumero: jest.fn(), testarConexao: jest.fn(), verificarPagamentoPorOrcamento: jest.fn().mockResolvedValue({ paid: false, idVenda: null, valor: 0 }), buscarRelacaoOrcamentoVenda: jest.fn().mockResolvedValue({ idvenda: null }) } }`;

if (!content.includes(oldAthosMock)) {
  console.error('CHANGE 2: AthosService mock not found');
  // Debug
  const idx2 = content.indexOf('AthosService');
  console.log('AthosService occurrences - first at:', idx2);
  if (idx2 > 0) console.log(JSON.stringify(content.substring(idx2-20, idx2+150)));
} else {
  content = content.replace(oldAthosMock, newAthosMock);
  console.log('Change 2 (AthosService mock) applied');
}

writeFileSync(path, content, 'utf8');
console.log('Done.');
