import { NfseService } from "./nfse.service";

function makeService() {
  const prisma = {
    quote: { findUnique: jest.fn(), update: jest.fn() },
  };
  const athosService = {
    buscarOrcamentoPorNumero: jest.fn(),
    buscarClientePorId: jest.fn(),
  };
  const nfseNacionalService = {
    emitir: jest.fn(),
  };
  const danfseNacionalPdfService = {
    gerar: jest.fn(),
  };
  const chatwootService = {
    sendOutgoingMessage: jest.fn(),
    sendAttachment: jest.fn(),
  };

  const service = Object.create(NfseService.prototype) as NfseService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  (service as any).prisma = prisma;
  (service as any).athosService = athosService;
  (service as any).nfseNacionalService = nfseNacionalService;
  (service as any).danfseNacionalPdfService = danfseNacionalPdfService;
  (service as any).chatwootService = chatwootService;
  // resolverTomadorQuote bate no Athos — mockado para o teste ficar isolado, sem cliente vinculado.
  (service as any).resolverTomadorQuote = jest.fn().mockResolvedValue({ idclienteAthos: null, documento: null, nome: null, endereco: null });
  // parseXml/storeXml tocam MinIO — sobrescritos na instancia para o teste ficar isolado.
  (service as any).parseXml = jest.fn().mockReturnValue({ numeroNfse: "42", chaveAcesso: "CHV42", dataEmissao: new Date("2026-09-02T10:00:00Z"), valorServico: 100 });
  (service as any).storeXml = jest.fn().mockResolvedValue({ objectName: "obj/42.xml", publicUrl: "https://minio/obj/42.xml" });

  return { service, prisma, athosService, nfseNacionalService, danfseNacionalPdfService, chatwootService };
}

const dtoBase = {
  codigoServico: "130501" as const,
  nomeTomador: "Nome Manual",
  cpfTomador: "11122233344",
  valorServico: 250,
};

describe("NfseService.emitirQuoteNfseAutomatica — entrega do DANFSe pelo Chatwoot", () => {
  it("Teste 1: conversationId presente e Chatwoot saudavel — DANFSe gerado e enviado, envioChatwoot.enviado=true", async () => {
    const { service, prisma, nfseNacionalService, danfseNacionalPdfService, chatwootService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q1", externalQuoteId: 601, internalNumber: null, nfseNumero: null, conversationId: BigInt(999) });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });
    const pdfBuffer = Buffer.from("PDF-BYTES");
    danfseNacionalPdfService.gerar.mockResolvedValue(pdfBuffer);
    chatwootService.sendOutgoingMessage.mockResolvedValue({ enabled: true, response: {} });
    chatwootService.sendAttachment.mockResolvedValue({ enabled: true, response: {} });

    const resultado = await service.emitirQuoteNfseAutomatica("q1", dtoBase as any);

    expect(danfseNacionalPdfService.gerar).toHaveBeenCalledWith("<xml/>");
    expect(chatwootService.sendOutgoingMessage).toHaveBeenCalledWith("999", expect.stringContaining("42"));
    expect(chatwootService.sendAttachment).toHaveBeenCalledWith("999", pdfBuffer, "NFSe-42.pdf", "application/pdf");
    expect(resultado.envioChatwoot).toEqual({ enviado: true });
  });

  it("Teste 2: quote sem conversationId — nenhuma chamada ao Chatwoot nem render de PDF, envioChatwoot.enviado=false com motivo", async () => {
    const { service, prisma, nfseNacionalService, danfseNacionalPdfService, chatwootService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q2", externalQuoteId: 602, internalNumber: null, nfseNumero: null, conversationId: null });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    const resultado = await service.emitirQuoteNfseAutomatica("q2", dtoBase as any);

    expect(danfseNacionalPdfService.gerar).not.toHaveBeenCalled();
    expect(chatwootService.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(chatwootService.sendAttachment).not.toHaveBeenCalled();
    expect(resultado.numero).toBe("42");
    expect(resultado.link).toBe("https://minio/obj/42.xml");
    expect(resultado.envioChatwoot.enviado).toBe(false);
    expect(resultado.envioChatwoot.motivo).toEqual(expect.stringContaining("conversa"));
  });

  it("Teste 3: danfseNacionalPdfService.gerar rejeita — emissao continua bem-sucedida, sem excecao propagada", async () => {
    const { service, prisma, nfseNacionalService, danfseNacionalPdfService, chatwootService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q3", externalQuoteId: 603, internalNumber: null, nfseNumero: null, conversationId: BigInt(999) });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });
    danfseNacionalPdfService.gerar.mockRejectedValue(new Error("render falhou"));

    const resultado = await service.emitirQuoteNfseAutomatica("q3", dtoBase as any);

    expect(resultado.numero).toBe("42");
    expect(resultado.link).toBe("https://minio/obj/42.xml");
    expect(prisma.quote.update).toHaveBeenCalledTimes(1);
    expect(chatwootService.sendOutgoingMessage).not.toHaveBeenCalled();
    expect(resultado.envioChatwoot.enviado).toBe(false);
    expect(resultado.envioChatwoot.motivo).toContain("render falhou");
  });

  it("Teste 4: sendAttachment rejeita depois de sendOutgoingMessage — emissao intacta, sem excecao propagada", async () => {
    const { service, prisma, nfseNacionalService, danfseNacionalPdfService, chatwootService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q4", externalQuoteId: 604, internalNumber: null, nfseNumero: null, conversationId: BigInt(999) });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });
    danfseNacionalPdfService.gerar.mockResolvedValue(Buffer.from("PDF-BYTES"));
    chatwootService.sendOutgoingMessage.mockResolvedValue({ enabled: true, response: {} });
    chatwootService.sendAttachment.mockRejectedValue(new Error("chatwoot fora do ar"));

    const resultado = await service.emitirQuoteNfseAutomatica("q4", dtoBase as any);

    expect(resultado.numero).toBe("42");
    expect(prisma.quote.update).toHaveBeenCalledTimes(1);
    expect(chatwootService.sendOutgoingMessage).toHaveBeenCalledTimes(1);
    expect(resultado.envioChatwoot.enviado).toBe(false);
    expect(resultado.envioChatwoot.motivo).toContain("chatwoot fora do ar");
  });
});
