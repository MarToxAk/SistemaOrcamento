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

  const service = Object.create(NfseService.prototype) as NfseService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  (service as any).prisma = prisma;
  (service as any).athosService = athosService;
  (service as any).nfseNacionalService = nfseNacionalService;
  // parseXml/storeXml tocam MinIO — sobrescritos na instancia para o teste ficar isolado.
  (service as any).parseXml = jest.fn().mockReturnValue({ numeroNfse: "42", chaveAcesso: "CHV42", dataEmissao: new Date("2026-09-02T10:00:00Z"), valorServico: 100 });
  (service as any).storeXml = jest.fn().mockResolvedValue({ objectName: "obj/42.xml", publicUrl: "https://minio/obj/42.xml" });

  return { service, prisma, athosService, nfseNacionalService };
}

const ENDERECO_ATHOS = {
  logradouro: "Rua Olimpio Leite da Silva",
  numero: "39",
  bairro: "Pereque",
  cep: "11480000",
  codigoMunicipio: "3520400",
  uf: "SP",
};

describe("NfseService.resolverTomadorQuote", () => {
  it("Teste 1: devolve documento, nome e endereco quando o orcamento tem cliente Athos", async () => {
    const { service, prisma, athosService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q1", externalQuoteId: 555, internalNumber: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });
    athosService.buscarClientePorId.mockResolvedValue({
      id: "123",
      name: "Cliente X",
      type: "fisico",
      documento: "12345678900",
      endereco: ENDERECO_ATHOS,
    });

    const resultado = await service.resolverTomadorQuote("q1");

    expect(resultado).toEqual({
      idclienteAthos: 123,
      documento: "12345678900",
      nome: "Cliente X",
      endereco: ENDERECO_ATHOS,
    });
    expect(athosService.buscarOrcamentoPorNumero).toHaveBeenCalledWith("555");
    expect(athosService.buscarClientePorId).toHaveBeenCalledWith(123);
  });

  it("Teste 2: devolve tudo nulo quando o orcamento nao tem cliente Athos vinculado", async () => {
    const { service, prisma, athosService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q2", externalQuoteId: 556, internalNumber: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: {} });

    const resultado = await service.resolverTomadorQuote("q2");

    expect(resultado).toEqual({ idclienteAthos: null, documento: null, nome: null, endereco: null });
    expect(athosService.buscarClientePorId).not.toHaveBeenCalled();
  });
});

describe("NfseService.emitirQuoteNfseAutomatica — tomador Athos", () => {
  const dtoBase = {
    codigoServico: "130501" as const,
    nomeTomador: "Nome Manual",
    cpfTomador: "11122233344",
    valorServico: 250,
  };

  it("Teste 3: repassa o endereco do Athos para nfseNacionalService.emitir, sem uf", async () => {
    const { service, prisma, athosService, nfseNacionalService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q3", externalQuoteId: 557, internalNumber: null, nfseNumero: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });
    athosService.buscarClientePorId.mockResolvedValue({
      id: "123",
      name: "Cliente X",
      type: "fisico",
      documento: "12345678900",
      endereco: ENDERECO_ATHOS,
    });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    await service.emitirQuoteNfseAutomatica("q3", dtoBase as any);

    expect(nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    const arg = nfseNacionalService.emitir.mock.calls[0][0];
    expect(arg.tomador.endereco).toEqual({
      logradouro: "Rua Olimpio Leite da Silva",
      numero: "39",
      bairro: "Pereque",
      cep: "11480000",
      codigoMunicipio: "3520400",
    });
    expect(arg.tomador.endereco.uf).toBeUndefined();
  });

  it("Teste 4: resiliente a falha do Athos — emite mesmo assim com endereco undefined", async () => {
    const { service, prisma, athosService, nfseNacionalService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q4", externalQuoteId: 558, internalNumber: null, nfseNumero: null });
    athosService.buscarOrcamentoPorNumero.mockRejectedValue(new Error("Athos indisponivel"));
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    const resultado = await service.emitirQuoteNfseAutomatica("q4", dtoBase as any);

    expect(athosService.buscarClientePorId).not.toHaveBeenCalled();
    expect(nfseNacionalService.emitir).toHaveBeenCalledTimes(1);
    const arg = nfseNacionalService.emitir.mock.calls[0][0];
    expect(arg.tomador.endereco).toBeUndefined();
    expect(resultado.numero).toBe("42");
  });

  it("Teste 5: repassa descricaoServico e incluirIbsCbs do DTO para emitir", async () => {
    const { service, prisma, athosService, nfseNacionalService } = makeService();
    prisma.quote.findUnique.mockResolvedValue({ id: "q5", externalQuoteId: 559, internalNumber: null, nfseNumero: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: {} });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    await service.emitirQuoteNfseAutomatica("q5", {
      ...dtoBase,
      descricaoServico: "2x Cartao de visita",
      incluirIbsCbs: true,
    } as any);

    const arg = nfseNacionalService.emitir.mock.calls[0][0];
    expect(arg.descricaoServico).toBe("2x Cartao de visita");
    expect(arg.incluirIbsCbs).toBe(true);
  });
});
