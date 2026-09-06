import { NotFoundException } from "@nestjs/common";

import { NfseService } from "./nfse.service";

function makeService() {
  const prisma = {
    quote: { findFirst: jest.fn(), update: jest.fn() },
  };
  const athosService = {
    buscarOrcamentoPorNumero: jest.fn(),
    buscarClientePorId: jest.fn(),
  };
  const nfseNacionalService = {
    emitir: jest.fn(),
  };
  const chatwootService = {
    sendOutgoingMessage: jest.fn(),
    sendAttachment: jest.fn(),
  };
  const danfseNacionalPdfService = {
    gerar: jest.fn(),
  };

  const service = Object.create(NfseService.prototype) as NfseService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  (service as any).prisma = prisma;
  (service as any).athosService = athosService;
  (service as any).nfseNacionalService = nfseNacionalService;
  (service as any).chatwootService = chatwootService;
  (service as any).danfseNacionalPdfService = danfseNacionalPdfService;
  // resolverTomadorQuote nesta task ainda le por findUnique (so refeito na Task 2) —
  // mockado para isolar o teste da resolucao de identificador em emitirQuoteNfseAutomatica.
  (service as any).resolverTomadorQuote = jest.fn().mockResolvedValue({ idclienteAthos: null, documento: null, nome: null, endereco: null });
  (service as any).parseXml = jest.fn().mockReturnValue({ numeroNfse: "42", chaveAcesso: "CHV42", dataEmissao: new Date("2026-09-06T10:00:00Z"), valorServico: 100 });
  (service as any).storeXml = jest.fn().mockResolvedValue({ objectName: "obj/42.xml", publicUrl: "https://minio/obj/42.xml" });

  return { service, prisma, athosService, nfseNacionalService, chatwootService, danfseNacionalPdfService };
}

const dtoBase = {
  codigoServico: "130501" as const,
  nomeTomador: "Nome Manual",
  cpfTomador: "11122233344",
  valorServico: 250,
};

const QUOTE_22764 = {
  id: "uuid-q22764",
  externalQuoteId: null,
  internalNumber: 22764,
  nfseNumero: null,
  conversationId: null,
};

describe("NfseService.emitirQuoteNfseAutomatica — resolucao de identificador (regressao 404)", () => {
  it("Teste F: identificador numerico que so casa por internalNumber NAO lanca NotFoundException, emite e grava com o UUID resolvido", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    // Primeiro candidato (externalQuoteId) nao acha; segundo (internalNumber) acha.
    prisma.quote.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(QUOTE_22764);
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    const resultado = await service.emitirQuoteNfseAutomatica("22764", dtoBase as any);

    expect(nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "uuid-q22764" } }),
    );
    expect(resultado.numero).toBe("42");
  });

  it("Teste G: storeXml recebe o prefixo derivado do UUID resolvido, nao do identificador cru da rota", async () => {
    const { service, prisma, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(QUOTE_22764);
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    await service.emitirQuoteNfseAutomatica("22764", dtoBase as any);

    expect((service as any).storeXml).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.anything(),
      "quotes/uuid-q22764",
    );
  });

  it("Teste H: identificador que nao casa nenhum candidato continua lancando NotFoundException", async () => {
    const { service, prisma } = makeService();
    prisma.quote.findFirst.mockResolvedValue(null);

    await expect(service.emitirQuoteNfseAutomatica("999999", dtoBase as any)).rejects.toThrow(
      new NotFoundException("Orcamento nao encontrado."),
    );
  });
});

describe("NfseService.resolverTomadorQuote — resolucao de identificador (Task 2)", () => {
  it("Teste I: resolve o orcamento pelo segundo candidato (internalNumber) e NAO lanca NotFoundException; sem externalQuoteId, devolve motivo sem-vinculo-athos sem consultar o Athos (T-i7c-03: sem fallback para internalNumber no lookup Athos)", async () => {
    const { service, prisma, athosService } = makeService();
    delete (service as any).resolverTomadorQuote; // remove o mock generico do makeService para usar o metodo real do prototype
    prisma.quote.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(QUOTE_22764);

    const resultado = await service.resolverTomadorQuote("22764");

    expect(resultado).toEqual({ idclienteAthos: null, documento: null, nome: null, endereco: null, motivo: "sem-vinculo-athos" });
    expect(prisma.quote.findFirst).toHaveBeenCalledTimes(2);
    expect(athosService.buscarOrcamentoPorNumero).not.toHaveBeenCalled();
  });
});

describe("NfseService.removerQuoteNfse — resolucao de identificador (Task 2)", () => {
  it("Teste J: resolve pelo segundo candidato e chama prisma.quote.update com a chave primaria igual ao UUID resolvido", async () => {
    const { service, prisma } = makeService();
    prisma.quote.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(QUOTE_22764);
    prisma.quote.update.mockResolvedValue({});

    const resultado = await service.removerQuoteNfse("22764");

    expect(resultado).toEqual({ ok: true });
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "uuid-q22764" } }),
    );
  });
});
