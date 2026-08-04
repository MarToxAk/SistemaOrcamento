import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import axios from "axios";
import { NfseService } from "./nfse.service";
import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "../athos/athos.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";
import { ConfigService } from "@nestjs/config";
import { consultarIbgePorCep } from "./viacep.util";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

// Caso real: idcliente=3485 (DP BARROS), CEP 05516030 (Sao Paulo), codigocidade=4121208 (Parana) — errado no Athos
const CLIENTE_MUNICIPIO_ERRADO = {
  id: "3485",
  name: "DP BARROS",
  type: "juridico" as const,
  documento: "98765432000110",
  endereco: {
    logradouro: "Rua Teste",
    numero: "50",
    bairro: "Centro",
    cep: "05516030",
    codigoMunicipio: "4121208",
    uf: "SP",
  },
};

function respostaErro(codigo: string, mensagem: string): string {
  return `<GerarNfseResposta><ListaMensagemRetorno><MensagemRetorno><Codigo>${codigo}</Codigo><Mensagem>${mensagem}</Mensagem></MensagemRetorno></ListaMensagemRetorno></GerarNfseResposta>`;
}

function respostaSucesso(numero: string): string {
  return `<GerarNfseResposta><Nfse><InfNfse><NumeroNfse>${numero}</NumeroNfse><CodigoVerificacao>OK</CodigoVerificacao></InfNfse></Nfse></GerarNfseResposta>`;
}

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("consultarIbgePorCep", () => {
  it("retorna {ibge,uf,localidade} quando ViaCEP responde com sucesso", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { ibge: "3550308", uf: "SP", localidade: "São Paulo" },
    });

    const resultado = await consultarIbgePorCep("05516030");

    expect(resultado).toEqual({ ibge: "3550308", uf: "SP", localidade: "São Paulo" });
  });

  it("retorna null SEM chamar a rede quando o CEP nao tem 8 digitos", async () => {
    const resultado = await consultarIbgePorCep("123");

    expect(resultado).toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("retorna null quando axios rejeita (timeout/rede)", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("ECONNABORTED"));

    const resultado = await consultarIbgePorCep("05516030");

    expect(resultado).toBeNull();
  });

  it("retorna null quando a resposta tem {erro:true}", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { erro: "true" } });

    const resultado = await consultarIbgePorCep("00000000");

    expect(resultado).toBeNull();
  });

  it("retorna null quando ibge esta ausente ou fora do padrao de 7 digitos", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { uf: "SP", localidade: "Sao Paulo" } });
    const semIbge = await consultarIbgePorCep("05516030");
    expect(semIbge).toBeNull();

    mockedAxios.get.mockResolvedValueOnce({ data: { ibge: "123", uf: "SP", localidade: "Sao Paulo" } });
    const ibgeCurto = await consultarIbgePorCep("05516030");
    expect(ibgeCurto).toBeNull();
  });
});

describe("deveTentarFallbackMunicipio", () => {
  it("retorna true para codigo E58", async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    expect((service as any).deveTentarFallbackMunicipio(["E58"], ["Codigo do municipio do tomador nao corresponde ao CEP"])).toBe(true);
  });

  it("retorna true para codigo E288", async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    expect((service as any).deveTentarFallbackMunicipio(["E288"], ["Codigo do municipio do tomador nao vinculado a UF"])).toBe(true);
  });

  it("retorna false para codigo nao relacionado a municipio (E165)", async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    expect((service as any).deveTentarFallbackMunicipio(["E165"], ["Aliquota invalida"])).toBe(false);
  });
});

describe("emitirParaContaReceber — fallback ViaCEP ponta-a-ponta (E58)", () => {
  it("re-tenta uma unica vez com o ibge do ViaCEP quando a prefeitura devolve E58, reutilizando o mesmo numero de RPS", async () => {
    const mocks = buildMocks({ buscarClientePorId: jest.fn().mockResolvedValue(CLIENTE_MUNICIPIO_ERRADO) });
    const service = await buildService(mocks);

    jest.spyOn(service as any, "getInfoNfse").mockResolvedValue({ proximoRps: 77, serieRps: "RPS" });

    const soapSpy = jest
      .spyOn(service as any, "enviarSoap")
      .mockResolvedValueOnce(respostaErro("E58", "Codigo do municipio do tomador do servico nao corresponde ao CEP informado."))
      .mockResolvedValueOnce(respostaSucesso("1234"));

    mockedAxios.get.mockResolvedValue({ data: { ibge: "3550308", uf: "SP", localidade: "Sao Paulo" } });

    const resultado = await service.emitirParaContaReceber({ clienteAthosId: 3485, valor: 100 });

    expect(soapSpy).toHaveBeenCalledTimes(2);

    const xml1: string = (soapSpy.mock.calls[0] as string[])[1];
    const xml2: string = (soapSpy.mock.calls[1] as string[])[1];

    const municipio1 = xml1.match(/<TomadorServico>[\s\S]*?<CodigoMunicipio>(\d+)<\/CodigoMunicipio>/)?.[1];
    const municipio2 = xml2.match(/<TomadorServico>[\s\S]*?<CodigoMunicipio>(\d+)<\/CodigoMunicipio>/)?.[1];

    expect(municipio1).toBe("4121208");
    expect(municipio2).toBe("3550308");

    expect(xml1).toContain("<Numero>77</Numero>");
    expect(xml2).toContain("<Numero>77</Numero>");

    expect(resultado.numero).toBe("1234");
  });
});
