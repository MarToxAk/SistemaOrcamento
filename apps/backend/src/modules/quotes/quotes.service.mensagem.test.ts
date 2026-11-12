import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { QuotesService } from "./quotes.service";
import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { EfiService } from "../integrations/efi/efi.service";

// Fase 46 (plano 46-02): enviarParaCliente com Chatwoot e EFI FALSOS (jest.fn).
// Nenhum teste fala com Chatwoot, EFI ou Athos reais. O EfiService usa o prototipo real so para
// que resolvePaymentOptions (puro) aplique as regras de PIX/50-50/cartao; a rede e falsa.

const NBSP = / /g;
const norm = (texto: string) => texto.replace(NBSP, " ");

type ItemFake = {
  descricao: string;
  quantidade: number;
  unitPrice: number;
  discount: number;
  finalPrice: number;
};

const dec = (n: number) => new Prisma.Decimal(n);

const makeQuoteCompleto = (opts: { externalQuoteId: number; itens: ItemFake[]; total: number; surcharge?: number }) => ({
  id: "quote-mensagem-001",
  internalNumber: 1,
  externalQuoteId: BigInt(opts.externalQuoteId),
  budgetDate: null,
  sellerExternalId: null,
  saleExternalId: null,
  status: "PENDENTE",
  approved: false,
  approvedAt: null,
  approvalToken: null,
  approvalExpiresAt: null,
  approvalRequestedAt: null,
  notes: null,
  total: dec(opts.total),
  discount: dec(0),
  surcharge: dec(opts.surcharge ?? 0),
  sellerName: null,
  conversationId: BigInt(777),
  chatwootContactId: null,
  validity: null,
  deliveryDate: null,
  paymentTerms: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  editedAt: null,
  customer: { id: "cus1", fullName: "Maria Silva", isAssociated: false, phone: null, email: null },
  items: opts.itens.map((it, i) => ({
    externalItemId: null,
    sequence: i + 1,
    quantity: dec(it.quantidade),
    unitPrice: dec(it.unitPrice),
    discount: dec(it.discount),
    finalPrice: dec(it.finalPrice),
    reference: null,
    description: it.descricao,
    shortDescription: it.descricao,
    productExternalId: null,
    children: [],
  })),
  stamps: [],
  documents: [],
});

const CODIGO_PIX = "00020126580014br.gov.bcb.pix0136TESTE-CODIGO-46520400005303986540513000KFAKE";

type Ambiente = {
  service: QuotesService;
  prisma: any;
  chatwoot: { sendOutgoingMessage: jest.Mock; sendAttachment: jest.Mock };
  efi: any;
  logger: { warn: jest.SpyInstance };
};

async function montarAmbiente(quote: ReturnType<typeof makeQuoteCompleto>, pixCopiaECola: unknown = null): Promise<Ambiente> {
  const prisma = {
    $transaction: jest.fn(),
    quote: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(quote),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(quote),
    },
    quoteItem: { create: jest.fn(), deleteMany: jest.fn() },
    quoteStatusHistory: { create: jest.fn() },
    customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    quoteStamp: { deleteMany: jest.fn() },
    quoteDocument: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
  };

  const efi = Object.assign(Object.create(EfiService.prototype), {
    createPixPaymentLink: jest.fn(async (input: { amount: number }) => ({
      txid: "tx1",
      amount: input.amount,
      originalAmount: input.amount,
      discountAmount: 0,
      linkVisualizacao: "https://pix.exemplo/abc",
      pixCopiaECola,
    })),
    createPix5050Link: jest.fn(async (input: { totalAmount: number }) => ({
      linkVisualizacao: "https://pix.exemplo/50",
      txid: "tx50",
      halfAmount: Number((input.totalAmount / 2).toFixed(2)),
    })),
    createCardPaymentLink: jest.fn().mockResolvedValue({ paymentUrl: "https://cartao.exemplo/x", chargeId: 1 }),
  });

  const chatwoot = {
    sendOutgoingMessage: jest.fn().mockResolvedValue({ enabled: true }),
    sendAttachment: jest.fn().mockResolvedValue({ enabled: true }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuotesService,
      { provide: PrismaService, useValue: prisma },
      {
        provide: AthosService,
        useValue: {
          buscarOrcamentoPorNumero: jest.fn().mockResolvedValue({ mapped: {} }),
          buscarClientePorId: jest.fn(),
          testarConexao: jest.fn(),
        },
      },
      {
        provide: QuotesPdfStorageService,
        useValue: {
          objectExists: jest.fn().mockResolvedValue(false),
          generateAndStore: jest.fn().mockResolvedValue({
            fileName: "orc.pdf",
            contentType: "application/pdf",
            objectName: "orc.pdf",
            publicUrl: null,
          }),
          downloadObjectBuffer: jest.fn().mockResolvedValue(Buffer.from("pdf")),
        },
      },
      { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      { provide: ChatwootService, useValue: chatwoot },
      { provide: EfiService, useValue: efi },
    ],
  }).compile();

  const service = module.get<QuotesService>(QuotesService);
  (service as any).checkPaymentStatus = jest.fn().mockResolvedValue(undefined);
  const warn = jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
  return { service, prisma, chatwoot, efi, logger: { warn } };
}

const mensagemPrincipal = (amb: Ambiente) => norm(String(amb.chatwoot.sendOutgoingMessage.mock.calls[0][1]));

describe("QuotesService.enviarParaCliente — mensagem (fase 46)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("M3 golden sem desconto: mensagem principal identica a de antes da fase 46", async () => {
    const quote = makeQuoteCompleto({
      externalQuoteId: 25877,
      total: 23.5,
      itens: [
        { descricao: "Caderno", quantidade: 2, unitPrice: 10, discount: 0, finalPrice: 20 },
        { descricao: "Lápis", quantidade: 1, unitPrice: 3.5, discount: 0, finalPrice: 3.5 },
      ],
    });
    const amb = await montarAmbiente(quote, null);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    // GOLDEN capturado do codigo ANTES de qualquer alteracao (HEAD fa0d60c)
    const GOLDEN = [
      "Olá, Maria! 👋",
      "",
      "Segue o resumo do seu pedido:",
      "",
      "📋 *Orçamento #25877*",
      "",
      "• Caderno (2x) — R$ 20,00",
      "• Lápis (1x) — R$ 3,50",
      "",
      "💰 *Total: R$ 23,50*",
      "",
      "────────────",
      "*Como você prefere pagar?*",
      "",
      "*1️⃣ PIX à vista — R$ 23,50*",
      "👉 https://pix.exemplo/abc",
      "",
      "────────────",
      "Qualquer dúvida, é só chamar! 😊",
    ].join("\n");
    expect(mensagemPrincipal(amb)).toBe(GOLDEN);
  });

  it("T1 tracer 25877: item riscado, Subtotal, Desconto e Total liquido; PIX em 130,00", async () => {
    const quote = makeQuoteCompleto({
      externalQuoteId: 25877,
      total: 130,
      itens: [{ descricao: "Caneta teste", quantidade: 200, unitPrice: 0.95, discount: 60, finalPrice: 130 }],
    });
    const amb = await montarAmbiente(quote, null);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    const msg = mensagemPrincipal(amb);
    const iItem = msg.indexOf("• Caneta teste (200x) — ~R$ 190,00~ R$ 130,00");
    const iSub = msg.indexOf("Subtotal: R$ 190,00");
    const iDesc = msg.indexOf("Desconto: -R$ 60,00");
    const iTotal = msg.indexOf("💰 *Total: R$ 130,00*");
    expect(iItem).toBeGreaterThanOrEqual(0);
    expect(iSub).toBeGreaterThan(iItem);
    expect(iDesc).toBeGreaterThan(iSub);
    expect(iTotal).toBeGreaterThan(iDesc);

    expect(amb.efi.createPixPaymentLink).toHaveBeenCalledTimes(1);
    expect(amb.efi.createPixPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 130 }));
  });

  it("M1 25952: desconto geral rateado, 583,00 so como Subtotal; PIX em 524,70", async () => {
    const quote = makeQuoteCompleto({
      externalQuoteId: 25952,
      total: 524.7,
      itens: [{ descricao: "Caneta lote", quantidade: 110, unitPrice: 5.3, discount: 58.3, finalPrice: 524.7 }],
    });
    const amb = await montarAmbiente(quote, null);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    const msg = mensagemPrincipal(amb);
    expect(msg).toContain("~R$ 583,00~ R$ 524,70");
    expect(msg).toContain("Subtotal: R$ 583,00");
    expect(msg).toContain("Desconto: -R$ 58,30");
    expect(msg).toContain("Total: R$ 524,70");
    expect(msg).not.toContain("Total: R$ 583,00");
    expect(amb.efi.createPixPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 524.7 }));
  });

  it("M2 25900 aumento de preco: sem Subtotal, Desconto nem texto riscado; PIX em 5,00", async () => {
    const quote = makeQuoteCompleto({
      externalQuoteId: 25900,
      total: 5,
      itens: [{ descricao: "Item teste", quantidade: 1, unitPrice: 5, discount: 0, finalPrice: 5 }],
    });
    const amb = await montarAmbiente(quote, null);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    const msg = mensagemPrincipal(amb);
    expect(msg).not.toContain("Subtotal");
    expect(msg).not.toContain("Desconto");
    expect(msg).not.toContain("~");
    expect(msg).toContain("• Item teste (1x) — R$ 5,00");
    expect(msg).toContain("Total: R$ 5,00");
    expect(amb.efi.createPixPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 5 }));
  });

  it("M4 acrescimo: Acrescimo +R$ 7,50 entra no Total de 137,50; PIX em 137,50", async () => {
    const quote = makeQuoteCompleto({
      externalQuoteId: 25877,
      total: 137.5,
      surcharge: 7.5,
      itens: [{ descricao: "Caneta teste", quantidade: 200, unitPrice: 0.95, discount: 60, finalPrice: 130 }],
    });
    const amb = await montarAmbiente(quote, null);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    const msg = mensagemPrincipal(amb);
    expect(msg).toContain("Subtotal: R$ 190,00");
    expect(msg).toContain("Desconto: -R$ 60,00");
    expect(msg).toContain("Acréscimo: +R$ 7,50");
    expect(msg).toContain("Total: R$ 137,50");
    expect(amb.efi.createPixPaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 137.5 }));
  });

  it("M5 bonificado: item 100% descontado aparece como ~R$ 12,00~ R$ 0,00 e o total do item mapeado e 0", async () => {
    const quote = makeQuoteCompleto({
      externalQuoteId: 25877,
      total: 20,
      itens: [
        { descricao: "Brinde", quantidade: 10, unitPrice: 1.2, discount: 12, finalPrice: 0 },
        { descricao: "Caderno", quantidade: 1, unitPrice: 20, discount: 0, finalPrice: 20 },
      ],
    });
    const amb = await montarAmbiente(quote, null);

    const mapeado = (amb.service as any).mapQuoteToAthosMapped(quote);
    expect(mapeado.itens[0].total).toBe(0);
    expect(mapeado.itens[1].total).toBe(20);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    const msg = mensagemPrincipal(amb);
    expect(msg).toContain("~R$ 12,00~ R$ 0,00");
    expect(msg).toContain("Subtotal: R$ 32,00");
    expect(msg).toContain("Desconto: -R$ 12,00");
    expect(msg).toContain("Total: R$ 20,00");
  });

  it("M6 mais de 10 itens: 10 linhas, aviso de itens restantes e resumo sobre os 12", async () => {
    const itens: ItemFake[] = Array.from({ length: 12 }, (_, i) => {
      const comDesconto = i === 3 || i === 11; // um dentro e um fora das 10 linhas exibidas
      return {
        descricao: `Item ${i + 1}`,
        quantidade: 1,
        unitPrice: 10,
        discount: comDesconto ? 2 : 0,
        finalPrice: comDesconto ? 8 : 10,
      };
    });
    const total = 12 * 10 - 4; // 116
    const quote = makeQuoteCompleto({ externalQuoteId: 25877, total, itens });
    const amb = await montarAmbiente(quote, null);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    const msg = mensagemPrincipal(amb);
    expect(msg.split("\n").filter((l) => l.startsWith("• Item "))).toHaveLength(10);
    expect(msg).toContain("_...e mais 2 item(s)_");
    expect(msg).toContain("Subtotal: R$ 120,00");
    expect(msg).toContain("Desconto: -R$ 4,00");
    expect(msg).toContain("Total: R$ 116,00");
  });

  it("M7 divergencia: Desconto exibido fecha (-R$ 90,00) e um aviso e registrado", async () => {
    const quote = makeQuoteCompleto({
      externalQuoteId: 25877,
      total: 100,
      itens: [{ descricao: "Caneta teste", quantidade: 200, unitPrice: 0.95, discount: 60, finalPrice: 130 }],
    });
    const amb = await montarAmbiente(quote, null);

    await amb.service.enviarParaCliente("quote-mensagem-001");

    const msg = mensagemPrincipal(amb);
    expect(msg).toContain("Subtotal: R$ 190,00");
    expect(msg).toContain("Desconto: -R$ 90,00");
    expect(msg).toContain("Total: R$ 100,00");
    const avisos = amb.logger.warn.mock.calls.map((c) => String(c[0]));
    expect(avisos.some((a) => a.toLowerCase().includes("diverg"))).toBe(true);
  });

  describe("Pix Copia e Cola em mensagem separada (D-07, D-08)", () => {
    const quote25877 = () =>
      makeQuoteCompleto({
        externalQuoteId: 25877,
        total: 130,
        itens: [{ descricao: "Caneta teste", quantidade: 200, unitPrice: 0.95, discount: 60, finalPrice: 130 }],
      });

    it("X1 separada: 2 mensagens (principal sem o codigo, depois so o codigo) e PDF por ultimo", async () => {
      const amb = await montarAmbiente(quote25877(), CODIGO_PIX);

      await amb.service.enviarParaCliente("quote-mensagem-001");

      expect(amb.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(2);
      const principal = String(amb.chatwoot.sendOutgoingMessage.mock.calls[0][1]);
      expect(principal).toContain("https://pix.exemplo/abc");
      expect(principal).not.toContain(CODIGO_PIX);
      expect(principal).not.toContain("caso prefira copiar");
      expect(amb.chatwoot.sendOutgoingMessage.mock.calls[1][0]).toBe(amb.chatwoot.sendOutgoingMessage.mock.calls[0][0]);
      expect(amb.chatwoot.sendOutgoingMessage.mock.calls[1][1]).toBe(CODIGO_PIX);

      expect(amb.chatwoot.sendAttachment).toHaveBeenCalledTimes(1);
      const ordemCodigo = amb.chatwoot.sendOutgoingMessage.mock.invocationCallOrder[1];
      const ordemPdf = amb.chatwoot.sendAttachment.mock.invocationCallOrder[0];
      expect(ordemCodigo).toBeLessThan(ordemPdf);
    });

    it.each([
      ["null", null],
      ["string vazia", ""],
      ["so espacos", "   "],
    ])("X2 sem codigo (%s): uma unica mensagem", async (_nome, valor) => {
      const amb = await montarAmbiente(quote25877(), valor);

      await amb.service.enviarParaCliente("quote-mensagem-001");

      expect(amb.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    });

    it("X3 falha na separada: so aviso sem o codigo, resultado igual e o PDF segue", async () => {
      const amb = await montarAmbiente(quote25877(), CODIGO_PIX);
      amb.chatwoot.sendOutgoingMessage
        .mockResolvedValueOnce({ enabled: true })
        .mockRejectedValueOnce(new Error("falha chatwoot"));

      const resultado = await amb.service.enviarParaCliente("quote-mensagem-001");

      expect(resultado).toEqual({ message: "Mensagem enviada (ou tentativa realizada).", approvalLink: null });
      const avisos = amb.logger.warn.mock.calls.map((c) => String(c[0]));
      const aviso = avisos.find((a) => a.includes("falha chatwoot"));
      expect(aviso).toBeDefined();
      expect(aviso).toContain("quote-mensagem-001");
      for (const a of avisos) expect(a).not.toContain(CODIGO_PIX);
      expect(amb.chatwoot.sendAttachment).toHaveBeenCalledTimes(1);
    });

    it("X4 falha na principal: a mensagem do codigo nao e tentada", async () => {
      const amb = await montarAmbiente(quote25877(), CODIGO_PIX);
      amb.chatwoot.sendOutgoingMessage.mockRejectedValueOnce(new Error("chatwoot fora"));

      await amb.service.enviarParaCliente("quote-mensagem-001");

      expect(amb.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
      const avisos = amb.logger.warn.mock.calls.map((c) => String(c[0]));
      expect(avisos.some((a) => a.includes("Falha ao enviar mensagem ao Chatwoot") && a.includes("chatwoot fora"))).toBe(true);
    });

    it("X5 sem PIX: mensagem de fallback atual, 1 chamada e nenhuma mensagem de codigo", async () => {
      const amb = await montarAmbiente(quote25877(), CODIGO_PIX);
      amb.efi.createPixPaymentLink.mockRejectedValueOnce(new Error("EFI fora"));

      await amb.service.enviarParaCliente("quote-mensagem-001");

      expect(amb.chatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
      const msg = mensagemPrincipal(amb);
      expect(msg).toContain("Orçamento #25877");
      expect(msg).toContain("💰 *Total: R$ 130.00*");
      expect(msg).not.toContain(CODIGO_PIX);
    });
  });
});
