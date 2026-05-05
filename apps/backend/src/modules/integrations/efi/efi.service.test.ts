import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EfiService } from "./efi.service";
import { PrismaService } from "../../database/prisma.service";
import { QuotesService } from "../../quotes/quotes.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";

describe("EfiService - getWebhookUrl", () => {
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
    const url: string = (service as any).getWebhookUrl();
    expect(url).toContain("/webhook/payment/pix");
    expect(url).toBe("https://example.com/api/integrations/efi/webhook/payment/pix");
  });

  it("retorna URL com /webhook/payment/pix quando BACKEND_URL está ausente (fallback)", async () => {
    service = await buildService({ BACKEND_URL: undefined, APP_BASE_URL: undefined });
    const url: string = (service as any).getWebhookUrl();
    expect(url).toContain("/webhook/payment/pix");
  });

  it("remove trailing slash do BACKEND_URL antes de construir o path", async () => {
    service = await buildService({ BACKEND_URL: "https://example.com/api/" });
    const url: string = (service as any).getWebhookUrl();
    // Não deve ter double slash no path (após o protocolo)
    const pathPart = url.replace(/^https?:\/\//, "");
    expect(pathPart).not.toContain("//");
    expect(url).toContain("/webhook/payment/pix");
  });
});
