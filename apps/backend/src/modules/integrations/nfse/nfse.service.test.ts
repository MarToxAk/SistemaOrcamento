import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { NfseService } from "./nfse.service";
import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "../athos/athos.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";
import { ConfigService } from "@nestjs/config";

const BASE_QUOTE = {
  id: "q1",
  internalNumber: "42",
  status: "PENDENTE",
  nfseNumero: null,
  nfseCodigoVerificacao: null,
  nfseLink: null,
  nfseEmitidaEm: null,
  total: 100,
  items: [],
  conversationId: null,
  customer: null,
  externalQuoteId: null,
};

const CLIENTE_PJ = {
  id: "100",
  name: "Empresa Teste Ltda",
  type: "juridico" as const,
  documento: "12345678000190",
  endereco: {
    logradouro: "Av Paulista",
    numero: "1000",
    bairro: "Bela Vista",
    cep: "01310100",
    codigoMunicipio: "3550308",
    uf: "SP",
  },
};

const CLIENTE_PF = {
  id: "200",
  name: "João da Silva",
  type: "fisico" as const,
  documento: "12345678901",
  endereco: {
    logradouro: "Rua das Flores",
    numero: "10",
    bairro: "Centro",
    cep: "11630000",
    codigoMunicipio: "3520400",
    uf: "SP",
  },
};

function buildMocks(overrides: { buscarClientePorId?: any } = {}) {
  const mockPrisma = {
    quote: {
      findFirst: jest.fn().mockResolvedValue(BASE_QUOTE),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const mockAthos = {
    buscarClientePorId: jest.fn().mockResolvedValue(CLIENTE_PJ),
    buscarOrcamentoPorNumero: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  const mockChatwoot = {
    sendOutgoingMessage: jest.fn().mockResolvedValue(undefined),
    sendAttachment: jest.fn().mockResolvedValue(undefined),
  };
  const mockConfig = {
    get: jest.fn((key: string) => {
      const vals: Record<string, string> = {
        NFSE_TOKEN: "tok",
        NFSE_CNPJ_PRESTADOR: "12345678000190",
        NFSE_INSCRICAO_MUNICIPAL: "12345",
        NFSE_SOAP_URL: "http://localhost/soap",
        NFSE_AUX_URL: "http://localhost/aux",
      };
      return vals[key] ?? "";
    }),
  };
  return { mockPrisma, mockAthos, mockChatwoot, mockConfig };
}

async function buildService(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NfseService,
      { provide: PrismaService, useValue: mocks.mockPrisma },
      { provide: AthosService, useValue: mocks.mockAthos },
      { provide: ChatwootService, useValue: mocks.mockChatwoot },
      { provide: ConfigService, useValue: mocks.mockConfig },
    ],
  }).compile();
  return module.get<NfseService>(NfseService);
}

describe("NfseService - resolucao de tomador por clienteAthosId", () => {
  it("deve chamar buscarClientePorId e chegar ate envio SOAP quando clienteAthosId valido com PJ", async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);

    // Mockar enviarSoap para evitar chamada de rede real
    jest.spyOn(service as any, "enviarSoap").mockResolvedValue(`
      <GerarNfseResposta>
        <Nfse><InfNfse><NumeroNfse>1001</NumeroNfse><CodigoVerificacao>ABCD</CodigoVerificacao></InfNfse></Nfse>
      </GerarNfseResposta>
    `);
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    const result = await service.emitir("q1", { clienteAthosId: 100 });

    expect(mocks.mockAthos.buscarClientePorId).toHaveBeenCalledWith(100);
    expect(result).toHaveProperty("numero");
  });

  it("deve lancar BadRequestException quando clienteAthosId nao encontrado", async () => {
    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValue(null) });
    const service = await buildService(mocks);
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    await expect(service.emitir("q1", { clienteAthosId: 999 })).rejects.toThrow(BadRequestException);
    await expect(service.emitir("q1", { clienteAthosId: 999 })).rejects.toThrow(/clienteAthosId/);
  });

  it("deve lancar BadRequestException quando cliente sem documento", async () => {
    const semDoc = { ...CLIENTE_PF, documento: null };
    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValue(semDoc) });
    const service = await buildService(mocks);
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    await expect(service.emitir("q1", { clienteAthosId: 5 })).rejects.toThrow(BadRequestException);
    await expect(service.emitir("q1", { clienteAthosId: 5 })).rejects.toThrow(/CPF ou CNPJ/);
  });

  it("deve lancar BadRequestException quando cliente sem endereco", async () => {
    const semEnd = { ...CLIENTE_PF, endereco: null };
    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValue(semEnd) });
    const service = await buildService(mocks);
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    await expect(service.emitir("q1", { clienteAthosId: 6 })).rejects.toThrow(BadRequestException);
    await expect(service.emitir("q1", { clienteAthosId: 6 })).rejects.toThrow(/Endere/);
  });

  it("deve NÃO chamar buscarClientePorId quando clienteAthosId ausente (fluxo legado)", async () => {
    const mocks = buildMocks();
    // buscarOrcamentoPorNumero retorna null → buscarTomador sem dados → lança BadRequestException TOMAD-04 (documento ausente)
    // O importante: buscarClientePorId NÃO deve ter sido chamado
    mocks.mockAthos.buscarClientePorId = jest.fn();
    const service = await buildService(mocks);
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    // Sem clienteAthosId, o fluxo cai em buscarTomador() que retorna null para orcamento
    // Isso vai lançar BadRequestException de documento ausente (TOMAD-04) — o que é esperado
    await expect(service.emitir("q1", {})).rejects.toThrow(BadRequestException);
    expect(mocks.mockAthos.buscarClientePorId).not.toHaveBeenCalled();
  });

  it("cenario 6: clienteAthosId PF - CPF do tomador presente no XML enviado ao SOAP (QUAL-02)", async () => {
    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValueOnce(CLIENTE_PF) });
    const service = await buildService(mocks);

    const soapSpy = jest
      .spyOn(service as any, "enviarSoap")
      .mockResolvedValueOnce(
        `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>1002</NumeroNfse><CodigoVerificacao>XYZ</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`,
      );
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    const result = await service.emitir("q1", { clienteAthosId: 200, servicoCodigo: "24.01" });

    expect(soapSpy).toHaveBeenCalledTimes(1);
    const xmlSent: string = (soapSpy.mock.calls[0] as string[])[1];  // arg[1] = dados (arg[0] = cabecalho)
    // CPF deve estar presente no XML (sem pontuacao)
    expect(xmlSent).toMatch(/12345678901/);
    // CNPJ nao deve aparecer com este numero de CPF
    expect(xmlSent).not.toMatch(/<CNPJ>12345678901<\/CNPJ>/);
    expect(result).toHaveProperty("numero");
  });


  it("cenario 7: desconto incondicionado reduz ValorServicos no XML", async () => {
    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValueOnce(CLIENTE_PJ) });
    const service = await buildService(mocks);

    const soapSpy = jest
      .spyOn(service as any, "enviarSoap")
      .mockResolvedValueOnce(
        `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>1003</NumeroNfse><CodigoVerificacao>XYZ</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`,
      );
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    await service.emitir("q1", {
      clienteAthosId: 100,
      servicoCodigo: "24.01",
      descontoAtivo: true,
      descontoValor: 10,
    });

    const xmlSent: string = (soapSpy.mock.calls[0] as string[])[1];
    expect(xmlSent).toContain("<ValorServicos>90.00</ValorServicos>");
    expect(xmlSent).toContain("<DescontoIncondicionado>10.00</DescontoIncondicionado>");
  });

});

describe("NfseService - getter CODIGO_MUNICIPIO (NFSE-01)", () => {
  it("getter CODIGO_MUNICIPIO retorna EMPRESA_MUNICIPIO_IBGE quando definida", async () => {
    const mocks = buildMocks();
    mocks.mockConfig.get = jest.fn((key: string) => {
      const vals: Record<string, string> = {
        NFSE_TOKEN: "tok",
        NFSE_CNPJ_PRESTADOR: "12345678000190",
        NFSE_INSCRICAO_MUNICIPAL: "12345",
        NFSE_SOAP_URL: "http://localhost/soap",
        NFSE_AUX_URL: "http://localhost/aux",
        EMPRESA_MUNICIPIO_IBGE: "3550308",
      };
      return vals[key] ?? undefined;
    });
    const service = await buildService(mocks);

    // Acessa o getter privado via cast — verifica o valor direto sem passar pelo XML
    const codigoMunicipio = (service as any).CODIGO_MUNICIPIO as string;
    expect(codigoMunicipio).toBe("3550308");
  });

  it("getter CODIGO_MUNICIPIO retorna fallback 3520400 quando EMPRESA_MUNICIPIO_IBGE ausente", async () => {
    const mocks = buildMocks();
    mocks.mockConfig.get = jest.fn((key: string) => {
      const vals: Record<string, string> = {
        NFSE_TOKEN: "tok",
        NFSE_CNPJ_PRESTADOR: "12345678000190",
        NFSE_INSCRICAO_MUNICIPAL: "12345",
        NFSE_SOAP_URL: "http://localhost/soap",
        NFSE_AUX_URL: "http://localhost/aux",
        // EMPRESA_MUNICIPIO_IBGE ausente — deve usar fallback 3520400
      };
      return vals[key] ?? undefined;
    });
    const service = await buildService(mocks);

    // Acessa o getter privado via cast — verifica fallback quando env var ausente
    const codigoMunicipio = (service as any).CODIGO_MUNICIPIO as string;
    expect(codigoMunicipio).toBe("3520400");
  });

  it("XML do servico usa EMPRESA_MUNICIPIO_IBGE quando definida (integracao getter->buildRpsXml)", async () => {
    const mocks = buildMocks();
    mocks.mockConfig.get = jest.fn((key: string) => {
      const vals: Record<string, string> = {
        NFSE_TOKEN: "tok",
        NFSE_CNPJ_PRESTADOR: "12345678000190",
        NFSE_INSCRICAO_MUNICIPAL: "12345",
        NFSE_SOAP_URL: "http://localhost/soap",
        NFSE_AUX_URL: "http://localhost/aux",
        EMPRESA_MUNICIPIO_IBGE: "9999999",
      };
      return vals[key] ?? undefined;
    });
    const service = await buildService(mocks);

    const soapSpy = jest
      .spyOn(service as any, "enviarSoap")
      .mockResolvedValueOnce(
        `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>2001</NumeroNfse><CodigoVerificacao>IBGE</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`,
      );
    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue(null);

    // Usa CLIENTE_PF (codigoMunicipio=3520400) para que o tomador nao contamine a busca
    const mocksMod = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValueOnce(CLIENTE_PF) });
    mocksMod.mockConfig.get = mocks.mockConfig.get;
    const serviceMod = await buildService(mocksMod);
    jest.spyOn(serviceMod as any, "enviarSoap").mockResolvedValueOnce(
      `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>2001</NumeroNfse><CodigoVerificacao>IBGE</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`,
    );
    jest.spyOn(serviceMod as any, "getInfoNfse").mockResolvedValue(null);

    await serviceMod.emitir("q1", { clienteAthosId: 200 });

    const soapSpyMod = (serviceMod as any).enviarSoap as jest.SpyInstance;
    // O segundo argumento de enviarSoap e o XML "dados" com o <Servico>
    const xmlSent: string = soapSpyMod.mock.calls[0][1];
    // O XML deve conter o codigo 9999999 dentro de <Servico> — unico local onde nao vem do tomador
    // Usa regex para garantir que e o CodigoMunicipio do Servico (entre </Discriminacao> e </Servico>)
    const servicoMatch = xmlSent.match(/<Discriminacao>[\s\S]*?<CodigoMunicipio>(\d+)<\/CodigoMunicipio>/);
    expect(servicoMatch).not.toBeNull();
    expect(servicoMatch![1]).toBe("9999999");
  });
});
