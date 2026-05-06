import { readFileSync, writeFileSync } from 'fs';

const servicePath = 'apps/backend/src/modules/quotes/quotes.service.ts';
const testPath = 'apps/backend/src/modules/quotes/quotes.service.unit.test.ts';

function detectNL(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

// ---------- Service ----------
let service = readFileSync(servicePath, 'utf8');
const sNL = detectNL(service);

const startMarker = '// APR-01: Sem associacao Athos exige pagamento confirmado (PIX, cartao ou caixa)';
const endMarker = `${sNL}    const updated = await this.prisma.quote.update({`;

const startIdx = service.indexOf(startMarker);
if (startIdx === -1) throw new Error('service start marker not found');
const endIdx = service.indexOf(endMarker, startIdx);
if (endIdx === -1) throw new Error('service end marker not found');

const newGuard = [
  '// APR-01/02: Regras de entrada em EM_PRODUCAO',
  '    // - Cliente associado Athos: exige aprovacao via link (approved=true)',
  '    // - Cliente nao associado: exige pagamento confirmado (approved=true ou saleExternalId)',
  '    if (newStatus === "EM_PRODUCAO") {',
  '      const isAssociated = Boolean((quote as any).customer?.isAssociated ?? false);',
  '      const hasSaleId = quote.saleExternalId != null;',
  '      const hasApproval = Boolean(quote.approved);',
  '',
  '      if (isAssociated && !hasApproval) {',
  '        throw new BadRequestException(',
  '          "Cliente associado ao Athos aguardando aprovacao via link. A aprovacao do cliente e obrigatoria antes de entrar em producao.",',
  '        );',
  '      }',
  '',
  '      if (!isAssociated && !hasApproval && !hasSaleId) {',
  '        throw new BadRequestException(',
  '          "Orcamento aguardando confirmacao de pagamento. Confirme o pagamento (PIX, pix parcial, cartao ou caixa) antes de entrar em producao.",',
  '        );',
  '      }',
  '    }',
  '',
].join(sNL);

service = service.substring(0, startIdx) + newGuard + service.substring(endIdx + sNL.length);
writeFileSync(servicePath, service, 'utf8');

// ---------- Tests ----------
let test = readFileSync(testPath, 'utf8');
const tNL = detectNL(test);

const replaces = [
  [
    'it("deve transitar de APROVADO para EM_PRODUCAO quando cliente e associado", async () => {',
    'it("deve transitar de APROVADO para EM_PRODUCAO quando cliente e associado e aprovado via link", async () => {',
  ],
  [
    'mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: false, saleExternalId: BigInt(1), customer: assocCustomer }));',
    'mockPrisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "APROVADO", approved: true, saleExternalId: null, customer: assocCustomer }));',
  ],
  [
    'it("deve permitir EM_PRODUCAO quando cliente associado sem pagamento (associado avanca livremente)", async () => {',
    'it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {',
  ],
  [
    '// isAssociated=true: nao precisa de pagamento confirmado',
    '// isAssociated=true sem approved: bloqueia ate aprovacao via link',
  ],
  [
    'await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).resolves.toBeDefined();',
    'await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);',
  ],
];

for (const [oldText, newText] of replaces) {
  if (test.includes(oldText)) test = test.replace(oldText, newText);
}

// add message assertion for associated without link approval test
const testBlockStart = 'it("deve bloquear EM_PRODUCAO quando cliente associado sem aprovacao via link", async () => {';
const idxBlock = test.indexOf(testBlockStart);
if (idxBlock !== -1) {
  const idxEnd = test.indexOf(`${tNL}    });`, idxBlock);
  if (idxEnd !== -1) {
    const block = test.substring(idxBlock, idxEnd + `${tNL}    });`.length);
    if (!block.includes('aprovacao via link')) {
      const injectAfter = 'await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow(BadRequestException);';
      const withMsg = `${injectAfter}${tNL}      await expect(service.changeStatus("quote-001", "EM_PRODUCAO", "test")).rejects.toThrow("aprovacao via link");`;
      const newBlock = block.replace(injectAfter, withMsg);
      test = test.substring(0, idxBlock) + newBlock + test.substring(idxEnd + `${tNL}    });`.length);
    }
  }
}

writeFileSync(testPath, test, 'utf8');
console.log('OK: v2 aplicado');
