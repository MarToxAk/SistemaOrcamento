import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EfiService } from "./efi.service";
import { PixComprovanteService } from "./pix-comprovante.service";
import { PrismaService } from "../../database/prisma.service";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";
import { quoteBase } from "../../quotes/__fixtures__/quote-pago.fixture";

// Fase 54 (plano 54-04, D-04/D-05): nota privada com comprovante apos o commit do pagamento PIX.
describe("EfiService - processWebhook: comprovante em nota privada (fase 54)", () => {
  let service: EfiService;

  const TXID = "txid-26809";
  const E2E = "E12345678202611250000abcdef12345";

  const ordem: string[] = [];

  const mockPrisma = {
    $transaction: jest.fn(),
    quote: { findFirst: jest.fn(), update: jest.fn() },
    paymentTransaction: { findFirst: jest.fn(), create: jest.fn() },
  };
  const mockQuotesService: any = {
    changeStatus: jest.fn(),
    sincronizarEtiquetasChatwoot: jest.fn(),
    getById: jest.fn(),
  };
  const mockChatwoot = {
    sendOutgoingMessage: jest.fn(),
    sendAttachment: jest.fn(),
    postConversationNote: jest.fn(),
  };
  const mockRender = { gerarPng: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue(undefined) };

  const PNG_OFICIAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const PNG_PROPRIO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);

  const payload = (extra: Record<string, unknown> = {}, valor = "164.35", txid = TXID, e2e = E2E) => ({
    pix: [{ txid, endToEndId: e2e, valor, horario: "2026-11-25T15:30:00.000Z", ...extra }],
  });

  async function montar(comRender = true): Promise<EfiService> {
    const providers: any[] = [
      EfiService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: QuotesService, useValue: mockQuotesService },
      { provide: ChatwootService, useValue: mockChatwoot },
      { provide: ConfigService, useValue: mockConfig },
    ];
    if (comRender) providers.push({ provide: PixComprovanteService, useValue: mockRender });
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    return module.get<EfiService>(EfiService);
  }

  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let oficialSpy: jest.SpyInstance;

  beforeEach(async () => {
    ordem.length = 0;
    jest.clearAllMocks();

    mockPrisma.paymentTransaction.findFirst.mockReset();
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue(null);
    mockPrisma.quote.findFirst.mockReset();
    mockPrisma.quote.findFirst.mockResolvedValue(quoteBase());
    mockPrisma.$transaction.mockReset();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const r = await cb({
        paymentTransaction: { create: jest.fn().mockResolvedValue({ id: "ptx-54-04" }) },
        quote: { update: jest.fn().mockImplementation(async ({ data }: any) => ({ status: data.status })) },
        quoteStatusHistory: { create: jest.fn().mockResolvedValue({ id: "h" }) },
      });
      ordem.push("transacao");
      return r;
    });

    mockQuotesService.sincronizarEtiquetasChatwoot.mockReset();
    mockQuotesService.sincronizarEtiquetasChatwoot.mockResolvedValue(undefined);
    mockQuotesService.getById.mockReset();
    mockQuotesService.getById.mockResolvedValue({
      body: {
        cliente: { nome: "Cliente Cinquenta e Quatro" },
        conversationId: 999,
        idorcamento: "26809",
        totais: { valor: "173.00" },
      },
      chatwootConversationUrl: null,
    });

    mockChatwoot.sendOutgoingMessage.mockReset();
    mockChatwoot.sendOutgoingMessage.mockImplementation(async () => {
      ordem.push("mensagem-cliente");
    });
    mockChatwoot.sendAttachment.mockReset();
    mockChatwoot.sendAttachment.mockImplementation(async () => {
      ordem.push("anexo");
      return { enabled: true };
    });
    mockChatwoot.postConversationNote.mockReset();
    mockChatwoot.postConversationNote.mockImplementation(async () => {
      ordem.push("nota-texto");
      return { enabled: true };
    });
    mockRender.gerarPng.mockReset();
    mockRender.gerarPng.mockResolvedValue(PNG_PROPRIO);

    service = await montar(true);
    oficialSpy = jest
      .spyOn(service, "buscarComprovanteOficial")
      .mockResolvedValue({ buffer: PNG_OFICIAL, contentType: "image/png", extensao: "png" });
    logSpy = jest.spyOn((service as any).logger, "log").mockImplementation(() => undefined);
    warnSpy = jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
  });

  const logsDoComprovante = (): string =>
    [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .map((c) => String(c[0]))
      .filter((l) => l.toLowerCase().includes("comprovante pix"))
      .join("\n");

  it("tracer: #26809 envia o comprovante oficial como anexo em nota privada, sem texto ao cliente", async () => {
    const result = await service.processWebhook(payload());

    expect(result.processed).toBe(1);
    expect(oficialSpy).toHaveBeenCalledWith(E2E);
    expect(mockRender.gerarPng).not.toHaveBeenCalled();
    expect(mockChatwoot.postConversationNote).not.toHaveBeenCalled();

    expect(mockChatwoot.sendAttachment).toHaveBeenCalledTimes(1);
    const [convId, buffer, nome, mime, opts] = mockChatwoot.sendAttachment.mock.calls[0];
    expect(convId).toBe("999");
    expect(Buffer.compare(buffer, PNG_OFICIAL)).toBe(0);
    expect(nome).toMatch(/^[A-Za-z0-9._-]+\.png$/);
    expect(mime).toBe("image/png");
    expect(opts.private).toBe(true);
    expect(opts.content).toContain("164,35");
    expect(opts.content).toContain("8,65");
    expect(opts.content).toContain("173,00");
    expect(opts.content).toContain(E2E);
    expect(opts.content).toContain(TXID);

    // D-05: o cliente so recebe a mensagem de confirmacao, nunca o texto do comprovante.
    expect(mockChatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    const msgCliente = String(mockChatwoot.sendOutgoingMessage.mock.calls[0][1]);
    expect(msgCliente).not.toContain(E2E);
    expect(msgCliente).not.toContain(TXID);
    expect(msgCliente).not.toContain("Pagamento PIX confirmado");

    expect(logsDoComprovante()).toContain(`Comprovante PIX postado quoteId=quote-26809 e2eId=${E2E} fonte=oficial`);
  });

  it("a nota so sai depois da transacao e depois da mensagem ao cliente", async () => {
    await service.processWebhook(payload());
    expect(ordem).toEqual(["transacao", "mensagem-cliente", "anexo"]);
  });

  it("oficial indisponivel (null): usa o PNG de layout proprio com private true", async () => {
    oficialSpy.mockResolvedValue(null);
    const result = await service.processWebhook(payload({ gnExtras: { pagador: { nome: "Maria Souza", cpf: "***.123.456-**" } } }));

    expect(result.processed).toBe(1);
    expect(mockRender.gerarPng).toHaveBeenCalledTimes(1);
    const dados = mockRender.gerarPng.mock.calls[0][0];
    expect(dados).toMatchObject({ numeroOrcamento: "26809", valorPago: 164.35, desconto: 8.65, totalOrcamento: 173, e2eId: E2E, txid: TXID, quitado: true });
    expect(dados.pagadorNome).toBe("Maria Souza");

    expect(mockChatwoot.sendAttachment).toHaveBeenCalledTimes(1);
    const [, buffer, nome, mime, opts] = mockChatwoot.sendAttachment.mock.calls[0];
    expect(Buffer.compare(buffer, PNG_PROPRIO)).toBe(0);
    expect(nome).toMatch(/^[A-Za-z0-9._-]+\.png$/);
    expect(mime).toBe("image/png");
    expect(opts.private).toBe(true);
    expect(opts.content).toContain("Maria Souza");
    expect(logsDoComprovante()).toContain("fonte=proprio");
  });

  it("oficial rejeitando tambem cai no layout proprio", async () => {
    oficialSpy.mockRejectedValue(new Error("falha inesperada"));
    await service.processWebhook(payload());
    expect(mockRender.gerarPng).toHaveBeenCalledTimes(1);
    expect(mockChatwoot.sendAttachment).toHaveBeenCalledTimes(1);
  });

  it("oficial indisponivel e gerarPng rejeitando: so o texto via postConversationNote", async () => {
    oficialSpy.mockResolvedValue(null);
    mockRender.gerarPng.mockRejectedValue(new Error("chromium morreu"));

    const result = await service.processWebhook(payload());

    expect(result.processed).toBe(1);
    expect(mockChatwoot.sendAttachment).not.toHaveBeenCalled();
    expect(mockChatwoot.postConversationNote).toHaveBeenCalledTimes(1);
    const [convId, texto] = mockChatwoot.postConversationNote.mock.calls[0];
    expect(convId).toBe("999");
    expect(texto).toContain("164,35");
    expect(texto).toContain(E2E);
    expect(logsDoComprovante()).toContain("fonte=apenas-texto");
  });

  it("renderizador nao injetado (provider ausente): so o texto via postConversationNote", async () => {
    service = await montar(false);
    jest.spyOn(service, "buscarComprovanteOficial").mockResolvedValue(null);
    jest.spyOn((service as any).logger, "log").mockImplementation(() => undefined);
    jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);

    const result = await service.processWebhook(payload());

    expect(result.processed).toBe(1);
    expect(mockChatwoot.sendAttachment).not.toHaveBeenCalled();
    expect(mockChatwoot.postConversationNote).toHaveBeenCalledTimes(1);
  });

  it("sendAttachment rejeitando: o texto cai em postConversationNote e o webhook segue processed", async () => {
    mockChatwoot.sendAttachment.mockRejectedValue(new Error("Chatwoot 500"));

    const result = await service.processWebhook(payload());

    expect(result.processed).toBe(1);
    expect(mockChatwoot.postConversationNote).toHaveBeenCalledTimes(1);
    expect(mockChatwoot.postConversationNote.mock.calls[0][1]).toContain("164,35");
  });

  it("sendAttachment sem Chatwoot configurado (enabled false) tambem cai no texto", async () => {
    mockChatwoot.sendAttachment.mockResolvedValue({ enabled: false });
    await service.processWebhook(payload());
    expect(mockChatwoot.postConversationNote).toHaveBeenCalledTimes(1);
  });

  it("postConversationNote tambem rejeitando: processWebhook resolve processed 1 e item processed", async () => {
    mockChatwoot.sendAttachment.mockRejectedValue(new Error("anexo falhou"));
    mockChatwoot.postConversationNote.mockRejectedValue(new Error("nota falhou"));

    const result = await service.processWebhook(payload());

    expect(result.processed).toBe(1);
    expect((result as any).results[0].status).toBe("processed");
    expect(logsDoComprovante()).toContain(`Falha no comprovante PIX quoteId=quote-26809 e2eId=${E2E}`);
  });

  it("falha na mensagem ao cliente nao impede o comprovante", async () => {
    mockChatwoot.sendOutgoingMessage.mockRejectedValue(new Error("Chatwoot fora"));
    const result = await service.processWebhook(payload());
    expect(result.processed).toBe(1);
    expect(mockChatwoot.sendAttachment).toHaveBeenCalledTimes(1);
  });

  it("duplicado (ignored_duplicate): nao busca comprovante, nao anexa e nao posta nota", async () => {
    mockPrisma.paymentTransaction.findFirst.mockResolvedValue({ id: "ptx-existente" });

    const result = await service.processWebhook(payload());

    expect(result.duplicates).toBe(1);
    expect(oficialSpy).not.toHaveBeenCalled();
    expect(mockRender.gerarPng).not.toHaveBeenCalled();
    expect(mockChatwoot.sendAttachment).not.toHaveBeenCalled();
    expect(mockChatwoot.postConversationNote).not.toHaveBeenCalled();
  });

  it("quote sem conversationId: nenhuma nota e nenhuma chamada a EFI de comprovante", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(quoteBase({ conversationId: null as any }));
    mockQuotesService.getById.mockResolvedValue({
      body: { cliente: { nome: "Sem Conversa" }, idorcamento: "26809", totais: { valor: "173.00" } },
      chatwootConversationUrl: null,
    });

    const result = await service.processWebhook(payload());

    expect(result.processed).toBe(1);
    expect(oficialSpy).not.toHaveBeenCalled();
    expect(mockChatwoot.sendAttachment).not.toHaveBeenCalled();
    expect(mockChatwoot.postConversationNote).not.toHaveBeenCalled();
  });

  it("getById falhando: usa o conversationId do quote para postar o comprovante", async () => {
    mockQuotesService.getById.mockRejectedValue(new Error("getById fora"));
    const result = await service.processWebhook(payload());
    expect(result.processed).toBe(1);
    expect(mockChatwoot.sendAttachment).toHaveBeenCalledTimes(1);
    expect(mockChatwoot.sendAttachment.mock.calls[0][0]).toBe("999");
  });

  it("texto livre do pagador (quebra, asteriscos, URL) nao chega ao content nem aos logs", async () => {
    const hostil = "Oi\n*negrito* veja https://phishing.exemplo/pagar e www.golpe.com";
    await service.processWebhook(payload({ infoPagador: hostil, gnExtras: { pagador: { nome: "Joao\nSilva", cnpj: "**.345.678/0001-**" } } }));

    const content: string = mockChatwoot.sendAttachment.mock.calls[0][4].content;
    expect(content).not.toContain("*");
    expect(content).not.toMatch(/https?:\/\//);
    expect(content).not.toContain("www.");
    const linhas = content.split("\n");
    const linhaMsg = linhas.find((l) => l.startsWith("Mensagem do pagador:")) ?? "";
    expect(linhaMsg).not.toBe("");
    expect(linhas.filter((l) => l.includes("veja") || l.includes("negrito"))).toHaveLength(1);
    expect(linhas.some((l) => l.trim() === "Silva")).toBe(false);

    // T-54-09: logs do comprovante nao carregam o texto do pagador nem o texto da nota.
    const logs = logsDoComprovante();
    expect(logs).not.toContain("phishing");
    expect(logs).not.toContain("negrito");
    expect(logs).not.toContain("Joao");
    expect(logs).not.toContain("164,35");
  });

  it("entrada 50%: nota privada informa pagamento parcial e sem desconto", async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(quoteBase({ secondInstallmentExternalId: "txid-entrada" }));
    await service.processWebhook(payload({}, "86.50", "txid-entrada", "E_ENTRADA_1"));

    const content: string = mockChatwoot.sendAttachment.mock.calls[0][4].content;
    expect(content).toContain("86,50");
    expect(content).toContain("pagamento parcial");
    expect(content).not.toContain("Desconto PIX");
    expect(mockChatwoot.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });

  it("numero do orcamento ausente no body: cai em externalQuoteId do quote", async () => {
    mockQuotesService.getById.mockResolvedValue({
      body: { cliente: { nome: "Fulano" }, conversationId: 999, totais: { valor: "173.00" } },
      chatwootConversationUrl: null,
    });
    oficialSpy.mockResolvedValue(null);
    await service.processWebhook(payload());
    expect(mockRender.gerarPng.mock.calls[0][0].numeroOrcamento).toBe("26809");
  });

  it("prazo: buscarComprovanteOficial nunca resolvendo nao segura o webhook alem do limite", async () => {
    (service as any).prazoComprovanteMs = 50;
    oficialSpy.mockImplementation(() => new Promise(() => undefined));

    const inicio = Date.now();
    const result = await service.processWebhook(payload());

    expect(result.processed).toBe(1);
    expect((result as any).results[0].status).toBe("processed");
    expect(Date.now() - inicio).toBeLessThan(2000);
    expect(logsDoComprovante()).toContain("Falha no comprovante PIX");
  });

  it("mocks antigos sem sendAttachment/postConversationNote nao quebram o webhook", async () => {
    const antigo: any = { sendOutgoingMessage: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        EfiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QuotesService, useValue: mockQuotesService },
        { provide: ChatwootService, useValue: antigo },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    const svc = module.get<EfiService>(EfiService);
    jest.spyOn(svc, "buscarComprovanteOficial").mockResolvedValue(null);
    jest.spyOn((svc as any).logger, "log").mockImplementation(() => undefined);
    jest.spyOn((svc as any).logger, "warn").mockImplementation(() => undefined);

    const result = await svc.processWebhook(payload());
    expect(result.processed).toBe(1);
    expect(antigo.sendOutgoingMessage).toHaveBeenCalledTimes(1);
  });
});
