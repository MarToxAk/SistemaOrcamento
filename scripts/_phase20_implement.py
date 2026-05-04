"""Phase 20: clienteAthosId em EmitirNfseInput + resolução de tomador + validações + testes."""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent

# ---------------------------------------------------------------------------
# Patch 1: nfse.service.ts — interface + bloco de resolução no emitir()
# ---------------------------------------------------------------------------
SERVICE = ROOT / "apps/backend/src/modules/integrations/nfse/nfse.service.ts"
content = SERVICE.read_text(encoding="utf-8")

# 1a) Adicionar campo clienteAthosId à interface EmitirNfseInput
OLD_IFACE_END = "  /** Base de calculo para desconto percentual; se ausente usa valorServicos (NFSD-02) */\n  totalPago?: number;\n}"
NEW_IFACE_END = """  /** Base de calculo para desconto percentual; se ausente usa valorServicos (NFSD-02) */
  totalPago?: number;
  /** ID do cliente Athos selecionado explicitamente; quando informado substitui o lookup via orcamento (TOMAD-01) */
  clienteAthosId?: number;
}"""
if "clienteAthosId" not in content:
    content = content.replace(OLD_IFACE_END, NEW_IFACE_END)

# 1b) Substituir o bloco de resolução do tomador em emitir()
OLD_TOMADOR_BLOCK = """    // Dados do tomador: body tem prioridade; Athos como fallback automático
    let tomadorCnpj = input?.tomadorCnpj ? input.tomadorCnpj.replace(/\\D/g, "") : null;
    let tomadorCpf  = input?.tomadorCpf  ? input.tomadorCpf.replace(/\\D/g, "")  : null;
    let tomadorNome = input?.tomadorNome?.trim() || null;

    let tomadorEndereco: TomadorEndereco | null = this.buildTomadorEnderecoFromInput(input);
    const documentoManualInformado = Boolean(tomadorCnpj || tomadorCpf);

    if (!tomadorCnpj && !tomadorCpf) {
      const tomador = await this.buscarTomador(quote);
      tomadorCnpj    = tomador.cnpj;
      tomadorCpf     = tomador.cpf;
      tomadorNome    = tomadorNome ?? tomador.nome;
      tomadorEndereco = tomadorEndereco ?? tomador.endereco;
    } else {
      tomadorNome = tomadorNome ?? quote.customer?.fullName ?? null;
      if (!tomadorEndereco) {
        const tomador = await this.buscarTomador(quote);
        tomadorEndereco = tomador.endereco;
      }
    }

    if (documentoManualInformado && !tomadorEndereco) {
      throw new BadRequestException(
        "Endereço do tomador é obrigatório quando o documento é informado manualmente. Preencha logradouro, número, bairro, CEP, código do município (IBGE) e UF.",
      );
    }"""

NEW_TOMADOR_BLOCK = """    // Dados do tomador: clienteAthosId tem prioridade máxima; depois manual; depois lookup por orçamento
    let tomadorCnpj = input?.tomadorCnpj ? input.tomadorCnpj.replace(/\\D/g, "") : null;
    let tomadorCpf  = input?.tomadorCpf  ? input.tomadorCpf.replace(/\\D/g, "")  : null;
    let tomadorNome = input?.tomadorNome?.trim() || null;

    let tomadorEndereco: TomadorEndereco | null = this.buildTomadorEnderecoFromInput(input);
    const documentoManualInformado = Boolean(tomadorCnpj || tomadorCpf);

    // Caminho A — clienteAthosId explícito (TOMAD-01, TOMAD-02)
    if (input?.clienteAthosId != null && Number.isFinite(input.clienteAthosId) && input.clienteAthosId > 0) {
      const info = await this.athosService.buscarClientePorId(input.clienteAthosId);
      if (!info) {
        throw new BadRequestException(
          `Cliente Athos não encontrado. Verifique o clienteAthosId informado (${input.clienteAthosId}).`,
        );
      }
      tomadorNome = tomadorNome ?? info.name ?? null;
      // Preservar endereço do input se informado explicitamente; senão usar o do Athos
      tomadorEndereco = tomadorEndereco ?? (info.endereco ?? null);
      if (info.type === "juridico" && info.documento?.replace(/\\D/g, "").length === 14) {
        tomadorCnpj = info.documento.replace(/\\D/g, "");
      } else if (info.type === "fisico" && info.documento?.replace(/\\D/g, "").length === 11) {
        tomadorCpf = info.documento.replace(/\\D/g, "");
      }
      this.logger.log(
        `[Tomador] resolvido via clienteAthosId=${input.clienteAthosId} tipo=${info.type} doc=${info.documento ?? "null"}`,
      );
    } else if (!tomadorCnpj && !tomadorCpf) {
      // Caminho C — nenhum clienteAthosId nem documento manual: lookup via orçamento
      const tomador = await this.buscarTomador(quote);
      tomadorCnpj    = tomador.cnpj;
      tomadorCpf     = tomador.cpf;
      tomadorNome    = tomadorNome ?? tomador.nome;
      tomadorEndereco = tomadorEndereco ?? tomador.endereco;
    } else {
      // Caminho B — documento manual informado: buscar apenas endereço se ausente
      tomadorNome = tomadorNome ?? quote.customer?.fullName ?? null;
      if (!tomadorEndereco) {
        const tomador = await this.buscarTomador(quote);
        tomadorEndereco = tomador.endereco;
      }
    }

    if (documentoManualInformado && !input?.clienteAthosId && !tomadorEndereco) {
      throw new BadRequestException(
        "Endereço do tomador é obrigatório quando o documento é informado manualmente. Preencha logradouro, número, bairro, CEP, código do município (IBGE) e UF.",
      );
    }

    // TOMAD-04: validar documento e endereço mínimo obrigatórios pós-resolução
    if (!tomadorCnpj && !tomadorCpf) {
      const fonte = input?.clienteAthosId
        ? `cliente Athos ${input.clienteAthosId}`
        : "orçamento/fallback";
      throw new BadRequestException(
        `CPF ou CNPJ do tomador ausente. Não foi possível obter documento a partir de: ${fonte}. Informe manualmente ou selecione um cliente com documento cadastrado.`,
      );
    }

    if (!tomadorEndereco) {
      const fonte = input?.clienteAthosId
        ? `cliente Athos ${input.clienteAthosId}`
        : "orçamento/fallback";
      throw new BadRequestException(
        `Endereço do tomador ausente. Não foi possível obter endereço a partir de: ${fonte}. Informe manualmente ou selecione um cliente com endereço cadastrado.`,
      );
    }"""

if "clienteAthosId > 0" not in content:
    if OLD_TOMADOR_BLOCK in content:
        content = content.replace(OLD_TOMADOR_BLOCK, NEW_TOMADOR_BLOCK)
    else:
        print("ERRO: bloco de tomador não encontrado no nfse.service.ts", file=sys.stderr)
        sys.exit(1)

SERVICE.write_text(content, encoding="utf-8")
print(f"[OK] {SERVICE} atualizado")

# ---------------------------------------------------------------------------
# Patch 2: nfse.service.test.ts — criar arquivo de testes
# ---------------------------------------------------------------------------
TEST_FILE = ROOT / "apps/backend/src/modules/integrations/nfse/nfse.service.test.ts"

TEST_CONTENT = r"""import { BadRequestException } from "@nestjs/common";
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
        <Nfse><InfNfse><Numero>1001</Numero><CodigoVerificacao>ABCD</CodigoVerificacao></InfNfse></Nfse>
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
});
"""

TEST_FILE.write_text(TEST_CONTENT, encoding="utf-8")
print(f"[OK] {TEST_FILE} criado")
print("Fase 20 patches aplicados.")
