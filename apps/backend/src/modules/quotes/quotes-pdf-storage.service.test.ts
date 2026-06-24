import { InternalServerErrorException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";

// Mock heavy deps that are not needed for template-logic tests
jest.mock("minio", () => ({ Client: jest.fn() }));
jest.mock("puppeteer", () => ({}));
jest.mock("node:fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn() } }));

// Import after mocks are registered
import * as fs from "node:fs";
import axios from "axios";
import { QuotesPdfStorageService } from "./quotes-pdf-storage.service";
import { PdfTemplatesRepository } from "../pdf-templates/pdf-templates.repository";

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockAxiosGet = (axios as unknown as { get: jest.Mock }).get;

const MINIMAL_PAYLOAD = {
  idorcamento_interno: 42,
  idorcamento: 42,
  dataorcamento: "2026-06-19",
  cliente: { nome: "Cliente Teste", telefone: "11999999999", email: "teste@teste.com" },
  vendedorNome: "Vendedor",
  validade: "2026-06-30",
  prazoEntrega: "2026-07-01",
  condicaoPagamento: "A vista",
  observacoes: "Nenhuma",
  itens: [],
  carimbos: { itens: [] },
  totais: { valor: 100, desconto: 0 },
};

function buildMockConfig(vals: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => vals[key]),
  };
}

function buildMockPdfTemplatesRepository(activeSource: string | null = null) {
  return {
    getActiveSource: jest.fn().mockResolvedValue(activeSource),
  } as unknown as PdfTemplatesRepository;
}

async function buildService(configVals: Record<string, string | undefined>, activeSource: string | null = null) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuotesPdfStorageService,
      { provide: ConfigService, useValue: buildMockConfig(configVals) },
      { provide: PdfTemplatesRepository, useValue: buildMockPdfTemplatesRepository(activeSource) },
    ],
  }).compile();
  return module.get<QuotesPdfStorageService>(QuotesPdfStorageService);
}

describe("QuotesPdfStorageService - cadeia de resolucao de template", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("(a) EMPRESA_PDF_TEMPLATE_PATH definida e arquivo existente: usa o conteudo do custom template", async () => {
    const CUSTOM_PATH = "/custom/meu-template.hbs";
    const CUSTOM_CONTENT = "<html>{{empresaNome}}</html>";

    mockExistsSync.mockImplementation((p) => p === CUSTOM_PATH);
    mockReadFileSync.mockReturnValue(CUSTOM_CONTENT);

    const service = await buildService({
      EMPRESA_PDF_TEMPLATE_PATH: CUSTOM_PATH,
      EMPRESA_NOME: "Empresa A",
      EMPRESA_CNPJ: "00.000.000/0001-00",
      EMPRESA_ENDERECO: "Rua A, 1",
    });

    // renderHtml é agora público e async
    const html = await service.renderHtml(MINIMAL_PAYLOAD);

    expect(mockReadFileSync).toHaveBeenCalledWith(CUSTOM_PATH, "utf-8");
    expect(html).toContain("Empresa A");
  });

  it("(b) EMPRESA_PDF_TEMPLATE_PATH definida e arquivo ausente: lanca InternalServerErrorException", async () => {
    const CUSTOM_PATH = "/custom/ausente.hbs";

    mockExistsSync.mockImplementation(() => false);

    const service = await buildService({
      EMPRESA_PDF_TEMPLATE_PATH: CUSTOM_PATH,
      EMPRESA_NOME: "Empresa B",
      EMPRESA_CNPJ: "00.000.000/0001-00",
      EMPRESA_ENDERECO: "Rua B, 1",
    });

    await expect(service.renderHtml(MINIMAL_PAYLOAD)).rejects.toThrow(InternalServerErrorException);
    await expect(service.renderHtml(MINIMAL_PAYLOAD)).rejects.toThrow(CUSTOM_PATH);
  });

  it("(c) sem EMPRESA_PDF_TEMPLATE_PATH + quote-default.hbs existente: usa o template padrao externo", async () => {
    const DEFAULT_CONTENT = "<html>padrao externo {{empresaCnpj}}</html>";

    // Sem EMPRESA_PDF_TEMPLATE_PATH; quote-default.hbs existe
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockReturnValue(DEFAULT_CONTENT);

    const service = await buildService({
      EMPRESA_NOME: "Empresa C",
      EMPRESA_CNPJ: "11.111.111/0001-11",
      EMPRESA_ENDERECO: "Rua C, 3",
    });

    const html = await service.renderHtml(MINIMAL_PAYLOAD);

    // Deve ter lido o arquivo de template padrao
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    // O path lido deve conter "quote-default.hbs"
    const calledPath = mockReadFileSync.mock.calls[0][0] as string;
    expect(calledPath).toContain("quote-default.hbs");
    expect(html).toContain("11.111.111/0001-11");
  });

  it("(d) sem EMPRESA_PDF_TEMPLATE_PATH + quote-default.hbs ausente: usa QUOTES_PDF_HTML_TEMPLATE (string TS)", async () => {
    // Nenhum arquivo existe
    mockExistsSync.mockImplementation(() => false);

    const service = await buildService({
      EMPRESA_NOME: "Empresa D",
      EMPRESA_CNPJ: "22.222.222/0002-22",
      EMPRESA_ENDERECO: "Rua D, 4",
    });

    const html = await service.renderHtml(MINIMAL_PAYLOAD);

    // Nao deve ter chamado readFileSync (usa string TS embutida)
    expect(mockReadFileSync).not.toHaveBeenCalled();
    // O HTML gerado deve ser string nao vazia
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  it("(e) EMPRESA_LOGO_URL ausente: empresaLogoUrl no contexto e undefined (sem <img>)", async () => {
    const TEMPLATE_COM_LOGO = "{{#if empresaLogoUrl}}<img src=\"{{empresaLogoUrl}}\">{{/if}}";

    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockReturnValue(TEMPLATE_COM_LOGO);

    const service = await buildService({
      // EMPRESA_LOGO_URL nao definida (ausente)
      EMPRESA_NOME: "Empresa E",
      EMPRESA_CNPJ: "33.333.333/0003-33",
      EMPRESA_ENDERECO: "Rua E, 5",
    });

    const html = await service.renderHtml(MINIMAL_PAYLOAD);

    // Handlebars: {{#if undefined}} e false, entao nao deve renderizar a tag img
    expect(html).not.toContain("<img");
  });

  it("(e2) EMPRESA_LOGO_URL http: baixa o logo e injeta como data: URI (rede bloqueada no PDF)", async () => {
    const TEMPLATE_COM_LOGO = "{{#if empresaLogoUrl}}<img src=\"{{empresaLogoUrl}}\">{{/if}}";
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockReturnValue(TEMPLATE_COM_LOGO);
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      headers: { "content-type": "image/png" },
    });

    const service = await buildService({ EMPRESA_LOGO_URL: "https://cdn.exemplo.com/logo.png" });
    const html = await service.renderHtml(MINIMAL_PAYLOAD);

    expect(mockAxiosGet).toHaveBeenCalledWith(
      "https://cdn.exemplo.com/logo.png",
      expect.objectContaining({ responseType: "arraybuffer" }),
    );
    // O <img> usa data: URI inline (e NÃO a URL externa, que o Puppeteer bloquearia)
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("https://cdn.exemplo.com");
  });

  it("(e3) EMPRESA_LOGO_URL http com falha de download: PDF gera sem <img>", async () => {
    const TEMPLATE_COM_LOGO = "{{#if empresaLogoUrl}}<img src=\"{{empresaLogoUrl}}\">{{/if}}";
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockReturnValue(TEMPLATE_COM_LOGO);
    mockAxiosGet.mockRejectedValue(new Error("ECONNREFUSED"));

    const service = await buildService({ EMPRESA_LOGO_URL: "https://cdn.exemplo.com/logo.png" });
    const html = await service.renderHtml(MINIMAL_PAYLOAD);

    expect(html).not.toContain("<img");
  });

  it("(f) EMPRESA_COR_PRIMARIA ausente: empresaCor no contexto e '#0d6efd' (fallback)", async () => {
    const TEMPLATE_COR = ":root { --primary: {{empresaCor}}; }";

    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockReturnValue(TEMPLATE_COR);

    const service = await buildService({
      // EMPRESA_COR_PRIMARIA nao definida
      EMPRESA_NOME: "Empresa F",
      EMPRESA_CNPJ: "44.444.444/0004-44",
      EMPRESA_ENDERECO: "Rua F, 6",
    });

    const html = await service.renderHtml(MINIMAL_PAYLOAD);

    expect(html).toContain("#0d6efd");
  });
});
