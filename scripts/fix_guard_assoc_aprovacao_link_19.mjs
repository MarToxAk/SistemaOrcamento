import { readFileSync, writeFileSync } from 'fs';

const servicePath = 'apps/backend/src/modules/quotes/quotes.service.ts';
const testPath = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';

function detectNL(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function replaceOrFail(content, oldText, newText, label) {
  if (!content.includes(oldText)) {
    throw new Error(`${label}: trecho alvo nao encontrado`);
  }
  return content.replace(oldText, newText);
}

// 1) Service guard update
let service = readFileSync(servicePath, 'utf8');
const sNL = detectNL(service);

const serviceOld = [
  '    // APR-01: Sem associacao Athos exige pagamento confirmado (PIX, cartao ou caixa)',
  '    // Clientes associados avancam livremente (link de aprovacao e enviado separadamente)',
  '    if (newStatus === "EM_PRODUCAO") {',
  '      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);',
  '      const hasSaleId = quote.saleExternalId != null;',
  '      const hasApproval = Boolean(quote.approved);',
  '',
  '      if (!isAssociated && !hasApproval && !hasSaleId) {',
  '        throw new BadRequestException(',
  '          "Orcamento aguardando confirmacao de pagamento. Confirme o pagamento (PIX, cartao ou caixa) antes de entrar em producao.",',
  '        );',
  '      }',
  '    }',
].join(sNL);

const serviceNew = [
  '    // APR-01/02: Regras de entrada em EM_PRODUCAO',
  '    // - Cliente associado Athos: exige aprovacao via link (approved=true)',
  '    // - Cliente nao associado: exige pagamento confirmado (approved=true ou saleExternalId)',
  '    if (newStatus === "EM_PRODUCAO") {',
  '      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);',
  '      const hasSaleId = quote.saleExternalId != null;',
  '      const hasApproval = Boolean(quote.approved);',
  '',
  '      if (isAssociated && !hasApproval) {',
  '        throw new BadRequestException(',
  '          "Cliente associado ao Athos aguardando aprovacao via link. Aprovacao do cliente e obrigatoria antes de entrar em producao.",',
  '        );',
  '      }',
  '',
  '      if (!isAssociated && !hasApproval && !hasSaleId) {',
  '        throw new BadRequestException(',
  '          "Orcamento aguardando confirmacao de pagamento. Confirme o pagamento (PIX, pix parcial, cartao ou caixa) antes de entrar em producao.",',
  '        );',
  '      }',
  '    }',
].join(sNL);

service = replaceOrFail(service, serviceOld, serviceNew, 'quotes.service.ts');
writeFileSync(servicePath, service, 'utf8');

// 2) Unit test updates
let test = readFileSync(testPath, 'utf8');
const tNL = detectNL(test);

const testReplacePairs = [
  {
    oldText: 'it("deve transitar de APROVADO para EM_PRODUCAO quando cliente e associado", async () => {',
    newText: 'it("deve transitar de APROVADO para EM_PRODUCAO quando cliente e associado e aprovado via link", async () => {',
  },
  {
    oldText: 'mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: BigInt(1), customer: assocCustomer }));',
    newText: 'mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, saleExternalId: null, customer: assocCustomer }));',
  },
  {
    oldText: 'it("deve permitir EM_PRODUCAO quando cliente associado sem pagamento (associado avanca livremente)", async () => {',
    newText: 'it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {',
  },
  {
    oldText: '// isAssociated=true: nao precisa de pagamento confirmado',
    newText: '// isAssociated=true sem approved: bloqueia ate aprovacao via link',
  },
  {
    oldText: 'mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));',
    newText: 'mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));',
  },
  {
    oldText: 'await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();',
    newText: 'await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);',
  },
  {
    oldText: 'it("deve permitir EM_PRODUCAO sem associacao quando tem approved=true", async () => {',
    newText: 'it("deve permitir EM_PRODUCAO sem associacao quando tem approved=true (pagamento confirmado)", async () => {',
  },
  {
    oldText: 'it("deve permitir EM_PRODUCAO sem associacao quando tem saleExternalId (pagamento no caixa Athos)", async () => {',
    newText: 'it("deve permitir EM_PRODUCAO sem associacao quando tem saleExternalId (pagamento no caixa)", async () => {',
  },
];

for (const p of testReplacePairs) {
  if (!test.includes(p.oldText)) {
    // keep going for idempotency except for critical lines below
    continue;
  }
  test = test.replace(p.oldText, p.newText);
}

// Strengthen associated-without-approval test message assertion
const blockOld = [
  '    it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {',
  '      // isAssociated=true sem approved: bloqueia ate aprovacao via link',
  '      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };',
  '      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null, customer: assocCustomer }));',
  '      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));',
  '      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);',
  '    });',
].join(tNL);

const blockNew = [
  '    it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {',
  '      // isAssociated=true sem approved: bloqueia ate aprovacao via link',
  '      const assocCustomer = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };',
  '      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: null, customer: assocCustomer }));',
  '      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer }));',
  '      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);',
  '      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow("aprovacao via link");',
  '    });',
].join(tNL);

if (test.includes(blockOld)) {
  test = test.replace(blockOld, blockNew);
}

writeFileSync(testPath, test, 'utf8');

console.log('OK: guard + testes atualizados');
