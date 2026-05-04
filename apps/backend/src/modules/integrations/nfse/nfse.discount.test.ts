/**
 * Testes unitários para lógica de desconto controlado na emissão de NFS-e (Fase 14)
 * Cobre: NFSD-01 (flag ativa), NFSD-02 (percentual), NFSD-03 (valor fixo), NFSD-04 (validações)
 */
import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";

import { NfseService, EmitirNfseInput } from "./nfse.service";

// ----- Mocks de dependências -----
const mockConfigService = {
  get: jest.fn((key: string) => {
    const map: Record<string, string> = {
      NFSE_TOKEN: "tok-test",
      NFSE_CNPJ_PRESTADOR: "00000000000000",
      NFSE_INSCRICAO_MUNICIPAL: "0001",
    };
    return map[key] ?? undefined;
  }),
};

const mockPrismaService = {
  quote: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
};

const mockAthosService = {
  buscarOrcamentoPorNumero: jest.fn().mockResolvedValue(null),
  buscarClientePorId: jest.fn().mockResolvedValue(null),
};

const mockChatwootService = {
  sendMessage: jest.fn().mockResolvedValue(undefined),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
};

// ----- Helpers -----
/** Gera um quote mínimo válido para emitir NFS-e */
function makeQuote(total: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1",
    internalNumber: 42,
    status: "APROVADO",
    nfseNumero: null,
    total,
    items: [],
    customer: { fullName: "Fulano", cpf: "12345678901" },
    ...overrides,
  };
}

// ----- Suite -----
describe("NfseService — desconto controlado (Fase 14)", () => {
  let service: NfseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfseService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: "PrismaService", useValue: mockPrismaService },
        { provide: "AthosService", useValue: mockAthosService },
        { provide: "ChatwootService", useValue: mockChatwootService },
      ],
    })
      .overrideProvider(NfseService)
      .useFactory({
        factory: () =>
          new NfseService(
            mockConfigService as unknown as ConfigService,
            mockPrismaService as any,
            mockAthosService as any,
            mockChatwootService as any,
          ),
      })
      .compile();

    service = module.get<NfseService>(NfseService);
  });

  // ────────────────────────────────────────────────────────────
  // NFSD-01: flag descontoAtivo=false → desconto zero
  // ────────────────────────────────────────────────────────────
  describe("buildRpsXml — campo DescontoIncondicionado", () => {
    function callBuildRps(descontoIncondicionado: number) {
      return (service as any).buildRpsXml({
        numero: 1,
        serie: "RPS",
        dataEmissao: "2025-01-01",
        valorServicos: 100.0,
        descontoIncondicionado,
        discriminacao: "Teste desconto",
        itemLista: "24.01",
        codigoNacional: "240101",
        aliquotaIss: "3.73",
        tomadorCpf: "12345678901",
        tomadorNome: "Fulano",
        tomadorEndereco: null,
      }) as string;
    }

    it("NFSD-01/05: sem desconto → DescontoIncondicionado=0.00 no XML", () => {
      const xml = callBuildRps(0);
      expect(xml).toContain("<DescontoIncondicionado>0.00</DescontoIncondicionado>");
    });

    it("NFSD-02/05: com desconto 15.50 → DescontoIncondicionado=15.50 no XML", () => {
      const xml = callBuildRps(15.5);
      expect(xml).toContain("<DescontoIncondicionado>15.50</DescontoIncondicionado>");
    });

    it("NFSD-05: desconto exato ao total → DescontoIncondicionado=100.00 no XML", () => {
      const xml = callBuildRps(100.0);
      expect(xml).toContain("<DescontoIncondicionado>100.00</DescontoIncondicionado>");
    });

    it("DescontoCondicionado permanece 0.00 mesmo com desconto aplicado", () => {
      const xml = callBuildRps(25.0);
      expect(xml).toContain("<DescontoCondicionado>0.00</DescontoCondicionado>");
    });
  });

  // ────────────────────────────────────────────────────────────
  // NFSD-04: validações de entrada
  // ────────────────────────────────────────────────────────────
  describe("emitir() — validações de desconto (NFSD-04)", () => {
    /** Configura prisma para retornar um quote válido */
    function setupQuote(total: number) {
      mockPrismaService.quote.findFirst.mockResolvedValue(makeQuote(total));
      mockPrismaService.quote.findUnique.mockResolvedValue(makeQuote(total));
    }

    it("percentual > 100 lança BadRequestException", async () => {
      setupQuote(200);
      const input: EmitirNfseInput = {
        tomadorCpf: "12345678901",
        tomadorNome: "Fulano",
        descontoAtivo: true,
        descontoPorcentagem: 101,
      };
      await expect(service.emitir("quote-1", input)).rejects.toThrow(BadRequestException);
      await expect(service.emitir("quote-1", input)).rejects.toThrow(/descontoPorcentagem deve estar entre 0 e 100/);
    });

    it("percentual negativo lança BadRequestException", async () => {
      setupQuote(200);
      const input: EmitirNfseInput = {
        tomadorCpf: "12345678901",
        tomadorNome: "Fulano",
        descontoAtivo: true,
        descontoPorcentagem: -5,
      };
      await expect(service.emitir("quote-1", input)).rejects.toThrow(BadRequestException);
    });

    it("descontoValor negativo lança BadRequestException", async () => {
      setupQuote(200);
      const input: EmitirNfseInput = {
        tomadorCpf: "12345678901",
        tomadorNome: "Fulano",
        descontoAtivo: true,
        descontoValor: -1,
      };
      await expect(service.emitir("quote-1", input)).rejects.toThrow(BadRequestException);
      await expect(service.emitir("quote-1", input)).rejects.toThrow(/nao pode ser negativo/);
    });

    it("desconto maior que valorServicos lança BadRequestException", async () => {
      setupQuote(100);
      const input: EmitirNfseInput = {
        tomadorCpf: "12345678901",
        tomadorNome: "Fulano",
        descontoAtivo: true,
        descontoValor: 150,
      };
      await expect(service.emitir("quote-1", input)).rejects.toThrow(BadRequestException);
      await expect(service.emitir("quote-1", input)).rejects.toThrow(/nao pode ser maior que valorServicos/);
    });
  });
});
