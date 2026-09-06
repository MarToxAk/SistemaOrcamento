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
    prisma.quote.findFirst.mockResolvedValue({ id: "q1", externalQuoteId: 555, internalNumber: null });
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
      motivo: null,
    });
    expect(athosService.buscarOrcamentoPorNumero).toHaveBeenCalledWith("555");
    expect(athosService.buscarClientePorId).toHaveBeenCalledWith(123);
  });

  it("Teste 2: devolve tudo nulo quando o orcamento nao tem cliente Athos vinculado", async () => {
    const { service, prisma, athosService } = makeService();
    prisma.quote.findFirst.mockResolvedValue({ id: "q2", externalQuoteId: 556, internalNumber: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: {} });

    const resultado = await service.resolverTomadorQuote("q2");

    expect(resultado).toEqual({ idclienteAthos: null, documento: null, nome: null, endereco: null, motivo: "cliente-nao-vinculado" });
    expect(athosService.buscarClientePorId).not.toHaveBeenCalled();
  });

  it("Teste 6: orcamento sem externalQuoteId devolve motivo sem-vinculo-athos e nao consulta o Athos", async () => {
    const { service, prisma, athosService } = makeService();
    prisma.quote.findFirst.mockResolvedValue({ id: "q6", externalQuoteId: null, internalNumber: 999 });

    const resultado = await service.resolverTomadorQuote("q6");

    expect(resultado).toEqual({ idclienteAthos: null, documento: null, nome: null, endereco: null, motivo: "sem-vinculo-athos" });
    expect(athosService.buscarOrcamentoPorNumero).not.toHaveBeenCalled();
  });

  it("Teste 7: distingue orcamento-nao-encontrado de athos-indisponivel no catch", async () => {
    const { service: service1, prisma: prisma1, athosService: athosService1 } = makeService();
    prisma1.quote.findFirst.mockResolvedValue({ id: "q7a", externalQuoteId: 700, internalNumber: null });
    athosService1.buscarOrcamentoPorNumero.mockRejectedValue(new NotFoundException("nao encontrado"));

    const resultado1 = await service1.resolverTomadorQuote("q7a");
    expect(resultado1.motivo).toBe("orcamento-nao-encontrado");

    const { service: service2, prisma: prisma2, athosService: athosService2 } = makeService();
    prisma2.quote.findFirst.mockResolvedValue({ id: "q7b", externalQuoteId: 701, internalNumber: null });
    athosService2.buscarOrcamentoPorNumero.mockRejectedValue(new Error("timeout"));

    const resultado2 = await service2.resolverTomadorQuote("q7b");
    expect(resultado2.motivo).toBe("athos-indisponivel");
  });

  it("Teste 8: distingue cliente-nao-vinculado de cliente-sem-cadastro", async () => {
    const { service: service1, prisma: prisma1, athosService: athosService1 } = makeService();
    prisma1.quote.findFirst.mockResolvedValue({ id: "q8a", externalQuoteId: 800, internalNumber: null });
    athosService1.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: {} });

    const resultado1 = await service1.resolverTomadorQuote("q8a");
    expect(resultado1.motivo).toBe("cliente-nao-vinculado");

    const { service: service2, prisma: prisma2, athosService: athosService2 } = makeService();
    prisma2.quote.findFirst.mockResolvedValue({ id: "q8b", externalQuoteId: 801, internalNumber: null });
    athosService2.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 321 } });
    athosService2.buscarClientePorId.mockResolvedValue(null);

    const resultado2 = await service2.resolverTomadorQuote("q8b");
    expect(resultado2.motivo).toBe("cliente-sem-cadastro");
  });

  it("Teste 9: caminho feliz devolve motivo null junto com documento/nome/endereco", async () => {
    const { service, prisma, athosService } = makeService();
    prisma.quote.findFirst.mockResolvedValue({ id: "q9", externalQuoteId: 900, internalNumber: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 456 } });
    athosService.buscarClientePorId.mockResolvedValue({
      id: "456",
      name: "Cliente Y",
      type: "fisico",
      documento: "98765432100",
      endereco: ENDERECO_ATHOS,
    });

    const resultado = await service.resolverTomadorQuote("q9");

    expect(resultado).toEqual({
      idclienteAthos: 456,
      documento: "98765432100",
      nome: "Cliente Y",
      endereco: ENDERECO_ATHOS,
      motivo: null,
    });
    expect(athosService.buscarOrcamentoPorNumero).toHaveBeenCalledWith("900");
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
    prisma.quote.findFirst.mockResolvedValue({ id: "q3", externalQuoteId: 557, internalNumber: null, nfseNumero: null });
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
    prisma.quote.findFirst.mockResolvedValue({ id: "q4", externalQuoteId: 558, internalNumber: null, nfseNumero: null });
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
    prisma.quote.findFirst.mockResolvedValue({ id: "q5", externalQuoteId: 559, internalNumber: null, nfseNumero: null });
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

  it("Teste 10: endereco manual completo no DTO vence sobre o do Athos", async () => {
    const { service, prisma, athosService, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue({ id: "q10", externalQuoteId: 560, internalNumber: null, nfseNumero: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });
    athosService.buscarClientePorId.mockResolvedValue({
      id: "123",
      name: "Cliente X",
      type: "fisico",
      documento: "12345678900",
      endereco: ENDERECO_ATHOS,
    });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    await service.emitirQuoteNfseAutomatica("q10", {
      ...dtoBase,
      enderecoLogradouro: "Rua Manual, 100",
      enderecoNumero: "100",
      enderecoBairro: "Centro Manual",
      enderecoCep: "11.480-999",
      enderecoCodigoMunicipio: "3550308",
    } as any);

    const arg = nfseNacionalService.emitir.mock.calls[0][0];
    expect(arg.tomador.endereco).toEqual({
      logradouro: "Rua Manual, 100",
      numero: "100",
      bairro: "Centro Manual",
      cep: "11480999",
      codigoMunicipio: "3550308",
    });
    expect(Object.keys(arg.tomador.endereco).sort()).toEqual(
      ["logradouro", "numero", "bairro", "cep", "codigoMunicipio"].sort(),
    );
  });

  it("Teste 11: DTO sem endereco continua repassando o endereco do Athos (sem regressao)", async () => {
    const { service, prisma, athosService, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue({ id: "q11", externalQuoteId: 561, internalNumber: null, nfseNumero: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });
    athosService.buscarClientePorId.mockResolvedValue({
      id: "123",
      name: "Cliente X",
      type: "fisico",
      documento: "12345678900",
      endereco: ENDERECO_ATHOS,
    });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    await service.emitirQuoteNfseAutomatica("q11", dtoBase as any);

    const arg = nfseNacionalService.emitir.mock.calls[0][0];
    expect(arg.tomador.endereco).toEqual({
      logradouro: "Rua Olimpio Leite da Silva",
      numero: "39",
      bairro: "Pereque",
      cep: "11480000",
      codigoMunicipio: "3520400",
    });
  });

  it("Teste 12: endereco manual parcial (sem CEP) cai de volta no endereco do Athos", async () => {
    const { service, prisma, athosService, nfseNacionalService } = makeService();
    prisma.quote.findFirst.mockResolvedValue({ id: "q12", externalQuoteId: 562, internalNumber: null, nfseNumero: null });
    athosService.buscarOrcamentoPorNumero.mockResolvedValue({ mapped: { idcliente: 123 } });
    athosService.buscarClientePorId.mockResolvedValue({
      id: "123",
      name: "Cliente X",
      type: "fisico",
      documento: "12345678900",
      endereco: ENDERECO_ATHOS,
    });
    nfseNacionalService.emitir.mockResolvedValue({ chaveAcesso: "CHV42", nfseXml: "<xml/>" });

    await service.emitirQuoteNfseAutomatica("q12", {
      ...dtoBase,
      enderecoLogradouro: "Rua Manual, 100",
      enderecoCodigoMunicipio: "3550308",
      // enderecoCep ausente de proposito
    } as any);

    const arg = nfseNacionalService.emitir.mock.calls[0][0];
    expect(arg.tomador.endereco).toEqual({
      logradouro: "Rua Olimpio Leite da Silva",
      numero: "39",
      bairro: "Pereque",
      cep: "11480000",
      codigoMunicipio: "3520400",
    });
  });
});
