/**
 * Testes de QuotesService.changeStatusLote (Fase 49, plano 49-02, D-03).
 * So mocks Jest: nenhuma chamada ao Athos de producao nem ao Chatwoot real.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QuotesService } from "./quotes.service";
import { PrismaService } from "../database/prisma.service";
import { AthosService } from "../integrations/athos/athos.service";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import { EfiService } from "../integrations/efi/efi.service";

const makeQuote = (overrides: Record<string, unknown> = {}) => ({
  id: "quote-001",
  internalNumber: 1,
  externalQuoteId: null,
  status: "ENVIADO",
  approved: false,
  approvedAt: null,
  approvalToken: null,
  approvalExpiresAt: null,
  notes: null,
  total: BigInt(10000),
  discount: BigInt(0),
  surcharge: BigInt(0),
  sellerName: null,
  conversationId: null,
  chatwootContactId: null,
  validity: null,
  deliveryDate: null,
  paymentTerms: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  editedAt: null,
  customer: { id: "cus1", fullName: "Test Cliente", isAssociated: false, phone: null, email: null },
  items: [],
  stamps: [],
  documents: [],
  ...overrides,
});

describe("QuotesService - changeStatusLote (Fase 49, D-03)", () => {
  let service: QuotesService;
  let prisma: any;
  let chatwoot: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      quote: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      quoteItem: { create: jest.fn(), deleteMany: jest.fn() },
      quoteStatusHistory: { create: jest.fn() },
      customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      quoteStamp: { deleteMany: jest.fn() },
      quoteDocument: { findFirst: jest.fn() },
    };
    chatwoot = {
      sendOutgoingMessage: jest.fn(),
      sendAttachment: jest.fn(),
      postConversationNote: jest.fn().mockResolvedValue({ enabled: true, sent: true }),
    };
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AthosService,
          useValue: {
            buscarOrcamentoPorNumero: jest.fn(),
            testarConexao: jest.fn(),
            verificarPagamentoPorOrcamento: jest.fn().mockResolvedValue({ paid: false, idVenda: null, valor: 0 }),
            buscarRelacaoOrcamentoVenda: jest.fn().mockResolvedValue({ idvenda: null }),
          },
        },
        { provide: QuotesPdfStorageService, useValue: { generateAndUploadPdf: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: ChatwootService, useValue: chatwoot },
        { provide: EfiService, useValue: { createCharge: jest.fn(), getChargeStatus: jest.fn() } },
      ],
    }).compile();
    service = modulo.get(QuotesService);
  });

  afterEach(() => jest.restoreAllMocks());

  it("chama changeStatus por item, na ordem, sempre silencioso, e devolve o resultado de cada um", async () => {
    const espiao = jest
      .spyOn(service, "changeStatus")
      .mockResolvedValue({ id: "uuid-x", statusKey: "ENTREGUE", statusLabel: "Entregue" } as any);

    const r = await service.changeStatusLote(["a", "b"], "ENTREGUE", "Painel");

    expect(espiao).toHaveBeenCalledTimes(2);
    expect(espiao).toHaveBeenNthCalledWith(1, "a", "ENTREGUE", "Painel", { notificarCliente: false });
    expect(espiao).toHaveBeenNthCalledWith(2, "b", "ENTREGUE", "Painel", { notificarCliente: false });
    expect(r).toEqual({
      total: 2,
      sucesso: 2,
      falha: 0,
      resultados: [
        { id: "a", ok: true, quoteId: "uuid-x", statusKey: "ENTREGUE", statusLabel: "Entregue" },
        { id: "b", ok: true, quoteId: "uuid-x", statusKey: "ENTREGUE", statusLabel: "Entregue" },
      ],
    });
  });

  it("e sequencial: a 2a chamada so comeca depois da 1a terminar", async () => {
    let liberar1!: (v: any) => void;
    const pendente = new Promise((res) => {
      liberar1 = res;
    });
    const espiao = jest
      .spyOn(service, "changeStatus")
      .mockImplementationOnce((() => pendente) as any)
      .mockResolvedValue({ id: "uuid-2", statusKey: "ENTREGUE", statusLabel: "Entregue" } as any);

    const promessa = service.changeStatusLote(["a", "b"], "ENTREGUE", "Painel");
    await new Promise((r) => setImmediate(r));
    expect(espiao).toHaveBeenCalledTimes(1);

    liberar1({ id: "uuid-1", statusKey: "ENTREGUE", statusLabel: "Entregue" });
    const r = await promessa;
    expect(espiao).toHaveBeenCalledTimes(2);
    expect(r.sucesso).toBe(2);
  });

  it("com changeStatus real: EM_PRODUCAO -> PRONTO_PARA_ENTREGA nao envia mensagem publica, so nota privada", async () => {
    prisma.quote.findFirst.mockResolvedValue(makeQuote({ status: "EM_PRODUCAO", conversationId: BigInt(42) }));
    prisma.quote.update.mockResolvedValue(
      makeQuote({
        status: "PRONTO_PARA_ENTREGA",
        conversationId: BigInt(42),
        customer: { id: "cus1", fullName: "Joao Silva", isAssociated: true, phone: null, email: null },
      }),
    );

    const r = await service.changeStatusLote(["quote-001"], "PRONTO_PARA_ENTREGA", "Painel");

    expect(chatwoot.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(chatwoot.postConversationNote).toHaveBeenCalledWith("42", expect.stringContaining("pronto para retirada"));
    expect(r.sucesso).toBe(1);
    expect(r.resultados[0]).toMatchObject({ id: "quote-001", ok: true, statusKey: "PRONTO_PARA_ENTREGA" });
    expect(prisma.quote.update.mock.calls[0][0].data.statusHistory.create.changedByName).toBe("Painel");
  });
});
