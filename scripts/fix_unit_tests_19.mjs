import { readFileSync, writeFileSync } from 'fs';

const path = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';
let content = readFileSync(path, 'utf8');
const CRLF = content.includes('\r\n');
const NL = CRLF ? '\r\n' : '\n';
function ln(s) { return CRLF ? s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : s; }

// === FIX 1: "deve transitar de APROVADO para EM_PRODUCAO quando cliente e associado"
// isAssociated=true, approved=false -> precisa de saleExternalId para passar o novo guard
const old1 = `mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, customer: assocCustomer }));`;
const new1 = `mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: BigInt(1), customer: assocCustomer }));`;
if (!content.includes(old1)) { console.error('FIX 1 not found'); }
else { content = content.replace(old1, new1); console.log('Fix 1 applied'); }

// === FIX 2: "deve transitar de APROVADO para EM_PRODUCAO quando orcamento foi aprovado"
// approved=true mas sem isAssociated - precisa adicionar customer isAssociated
const old2 = `    it("deve transitar de APROVADO para EM_PRODUCAO quando orcamento foi aprovado", async () => {
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO" }));`;
const new2 = `    it("deve transitar de APROVADO para EM_PRODUCAO quando orcamento foi aprovado", async () => {
      const assocCustomer2 = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
      mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, customer: assocCustomer2 }));
      mockPrisma.quote.update.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", customer: assocCustomer2 }));`;

const idx2 = content.indexOf(old2.replace(/\n/g, NL));
const idx2lf = content.indexOf(old2);
const found2 = idx2 !== -1 ? idx2 : idx2lf;
if (found2 === -1) { console.error('FIX 2 not found'); }
else {
  const len2 = old2.replace(/\n/g, NL).length;
  content = content.substring(0, found2) + ln(new2) + content.substring(found2 + (idx2 !== -1 ? len2 : old2.length));
  console.log('Fix 2 applied');
}

// === FIX 3: Chatwoot "deve chamar sendOutgoingMessage quando newStatus === EM_PRODUCAO e conversationId existe"
// findFirst mock sem isAssociated - precisa adicionar
const old3 = `    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: BigInt(42) }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    await service.changeStatus("quote-001", "EM_PRODUCAO", "test");
    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("entrou em produção"));`;
const new3 = `    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    await service.changeStatus("quote-001", "EM_PRODUCAO", "test");
    expect(chatwootMock.sendOutgoingMessage).toHaveBeenCalledWith("42", expect.stringContaining("entrou em produção"));`;

const idx3 = content.indexOf(old3.replace(/\n/g, NL));
const idx3lf = content.indexOf(old3);
const found3 = idx3 !== -1 ? idx3 : idx3lf;
if (found3 === -1) { console.error('FIX 3 not found'); }
else {
  const lenOld3 = idx3 !== -1 ? old3.replace(/\n/g, NL).length : old3.length;
  content = content.substring(0, found3) + ln(new3) + content.substring(found3 + lenOld3);
  console.log('Fix 3 applied');
}

// === FIX 4: "deve logar warn e NAO lancar quando conversationId e null" (approved=true, sem isAssociated)
const old4 = `    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: null }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: null }),
    );
    await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    expect(chatwootMock.sendOutgoingMessage).not.toHaveBeenCalled();`;
const new4 = `    const assocCust4 = { id: "cus1", fullName: "Assoc", isAssociated: true, phone: null, email: null };
    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: null, customer: assocCust4 }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: null, customer: assocCust4 }),
    );
    await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();
    expect(chatwootMock.sendOutgoingMessage).not.toHaveBeenCalled();`;

const idx4 = content.indexOf(old4.replace(/\n/g, NL));
const idx4lf = content.indexOf(old4);
const found4 = idx4 !== -1 ? idx4 : idx4lf;
if (found4 === -1) { console.error('FIX 4 not found'); }
else {
  const lenOld4 = idx4 !== -1 ? old4.replace(/\n/g, NL).length : old4.length;
  content = content.substring(0, found4) + ln(new4) + content.substring(found4 + lenOld4);
  console.log('Fix 4 applied');
}

// === FIX 5: "deve logar warn e NAO lancar quando sendOutgoingMessage lanca excecao" (approved=true, sem isAssociated)
const old5 = `    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: BigInt(42) }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    (chatwootMock.sendOutgoingMessage as jest.Mock).mockRejectedValue(new Error("timeout"));
    await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();`;
const new5 = `    mockPrisma.quote.findFirst.mockResolvedValue(
      makeQuote({ status: "APROVADO", approved: true, conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    mockPrisma.quote.update.mockResolvedValue(
      makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42), customer: { id: "cus1", fullName: "João Silva", isAssociated: true, phone: null, email: null } }),
    );
    (chatwootMock.sendOutgoingMessage as jest.Mock).mockRejectedValue(new Error("timeout"));
    await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();`;

const idx5 = content.indexOf(old5.replace(/\n/g, NL));
const idx5lf = content.indexOf(old5);
const found5 = idx5 !== -1 ? idx5 : idx5lf;
if (found5 === -1) { console.error('FIX 5 not found'); }
else {
  const lenOld5 = idx5 !== -1 ? old5.replace(/\n/g, NL).length : old5.length;
  content = content.substring(0, found5) + ln(new5) + content.substring(found5 + lenOld5);
  console.log('Fix 5 applied');
}

writeFileSync(path, content, 'utf8');
console.log('Done.');
