import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EfiService } from "./efi.service";
import { PrismaService } from "../../database/prisma.service";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";

describe("EfiService - getPixWebhookUrl", () => {
  let service: EfiService;

  const mockPrisma = {
    $transaction: jest.fn(),
    quote: { findFirst: jest.fn(), update: jest.fn() },
    paymentTransaction: { findFirst: jest.fn(), create: jest.fn() },
  };

  const mockQuotesService = { changeStatus: jest.fn() };
  const mockChatwootService = { sendOutgoingMessage: jest.fn() };

  function buildService(configMap: Record<string, string | undefined>): Promise<EfiService> {
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => configMap[key]),
    };
    return Test.createTestingModule({
      providers: [
        EfiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QuotesService, useValue: mockQuotesService },
        { provide: ChatwootService, useValue: mockChatwootService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    })
      .compile()
      .then((module: TestingModule) => module.get<EfiService>(EfiService));
  }

  afterEach(() => jest.clearAllMocks());

  it("retorna URL com /webhook/payment/pix quando BACKEND_URL está configurado", async () => {
    service = await buildService({ BACKEND_URL: "https://example.com/api" });
    const url: string = (service as any).getPixWebhookUrl();
    expect(url).toContain("/webhook/payment/pix");
    expect(url).toBe("https://example.com/api/integrations/efi/webhook/payment/pix");
  });

  it("retorna URL com /webhook/payment/pix quando BACKEND_URL está ausente (fallback)", async () => {
    service = await buildService({ BACKEND_URL: undefined, APP_BASE_URL: undefined });
    const url: string = (service as any).getPixWebhookUrl();
    expect(url).toContain("/webhook/payment/pix");
  });

  it("remove trailing slash do BACKEND_URL antes de construir o path", async () => {
    service = await buildService({ BACKEND_URL: "https://example.com/api/" });
    const url: string = (service as any).getPixWebhookUrl();
    // Não deve ter double slash no path (após o protocolo)
    const pathPart = url.replace(/^https?:\/\//, "");
    expect(pathPart).not.toContain("//");
    expect(url).toContain("/webhook/payment/pix");
  });
});

describe("EfiService - registerPixWebhook", () => {
  let service: EfiService;

  const mockPrisma = {
    $transaction: jest.fn(),
    quote: { findFirst: jest.fn(), update: jest.fn() },
    paymentTransaction: { findFirst: jest.fn(), create: jest.fn() },
  };

  const mockQuotesService = { changeStatus: jest.fn() };
  const mockChatwootService = { sendOutgoingMessage: jest.fn() };

  const FULL_CONFIG: Record<string, string | undefined> = {
    EFI_CERT_PEM: "cert-pem-content",
    EFI_KEY_PEM: "key-pem-content",
    EFI_PIX_KEY: "chave-teste",
    EFI_CLIENT_ID: "client-id",
    EFI_CLIENT_SECRET: "client-secret",
    BACKEND_URL: "https://example.com/api",
    EFI_BASE_URL: "https://api-efi-teste.com",
  };

  function buildService(configMap: Record<string, string | undefined>): Promise<EfiService> {
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => configMap[key]),
    };
    return Test.createTestingModule({
      providers: [
        EfiService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QuotesService, useValue: mockQuotesService },
        { provide: ChatwootService, useValue: mockChatwootService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    })
      .compile()
      .then((module: TestingModule) => module.get<EfiService>(EfiService));
  }

  afterEach(() => jest.clearAllMocks());

  it("retorna missing_credentials quando não há certificado/chave mTLS configurados", async () => {
    service = await buildService({
      EFI_PIX_KEY: "chave-teste",
      EFI_CLIENT_ID: "client-id",
      EFI_CLIENT_SECRET: "client-secret",
      BACKEND_URL: "https://example.com/api",
    });
    const result = await service.registerPixWebhook();
    expect(result).toEqual({ registered: false, reason: "missing_credentials" });
  });

  it("retorna missing_pix_key quando EFI_PIX_KEY não está configurada", async () => {
    service = await buildService({
      EFI_CERT_PEM: "cert-pem-content",
      EFI_KEY_PEM: "key-pem-content",
      EFI_CLIENT_ID: "client-id",
      EFI_CLIENT_SECRET: "client-secret",
      BACKEND_URL: "https://example.com/api",
    });
    const result = await service.registerPixWebhook();
    expect(result).toEqual({ registered: false, reason: "missing_pix_key" });
  });

  it("retorna missing_oauth_credentials quando EFI_CLIENT_ID/EFI_CLIENT_SECRET não estão configurados", async () => {
    service = await buildService({
      EFI_CERT_PEM: "cert-pem-content",
      EFI_KEY_PEM: "key-pem-content",
      EFI_PIX_KEY: "chave-teste",
      BACKEND_URL: "https://example.com/api",
    });
    const result = await service.registerPixWebhook();
    expect(result).toEqual({ registered: false, reason: "missing_oauth_credentials" });
  });

  it("retorna non_public_url quando a URL calculada aponta para localhost (dev)", async () => {
    service = await buildService({
      EFI_CERT_PEM: "cert-pem-content",
      EFI_KEY_PEM: "key-pem-content",
      EFI_PIX_KEY: "chave-teste",
      EFI_CLIENT_ID: "client-id",
      EFI_CLIENT_SECRET: "client-secret",
      BACKEND_URL: undefined,
      APP_BASE_URL: undefined,
    });
    const result = await service.registerPixWebhook();
    expect(result).toEqual({ registered: false, reason: "non_public_url" });
  });

  it("registra o webhook na EFI com sucesso quando tudo está configurado e a URL é publica", async () => {
    service = await buildService(FULL_CONFIG);
    const putMock = jest.fn().mockResolvedValue({ data: {} });
    jest.spyOn(service as any, "getHttpClient").mockReturnValue({ put: putMock });
    jest.spyOn(service as any, "getAccessToken").mockResolvedValue("fake-token");

    const result = await service.registerPixWebhook();

    expect(result).toEqual({ registered: true, reason: "ok" });
    expect(putMock).toHaveBeenCalledWith(
      "/v2/webhook/chave-teste",
      { webhookUrl: "https://example.com/api/integrations/efi/webhook/payment/pix" },
      { headers: { Authorization: "Bearer fake-token", "Content-Type": "application/json" } },
    );
  });

  it("retorna efi_api_error quando a chamada PUT falha, sem lancar excecao", async () => {
    service = await buildService(FULL_CONFIG);
    const putMock = jest.fn().mockRejectedValue(new Error("network failure"));
    jest.spyOn(service as any, "getHttpClient").mockReturnValue({ put: putMock });
    jest.spyOn(service as any, "getAccessToken").mockResolvedValue("fake-token");

    const result = await service.registerPixWebhook();

    expect(result).toEqual({ registered: false, reason: "efi_api_error" });
  });
});
