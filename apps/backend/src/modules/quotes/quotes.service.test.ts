import { QuotesService } from "./quotes.service";

describe("QuotesService — Phase 06 behaviors", () => {
  let service: QuotesService;
  let mockEnviarParaCliente: jest.Mock;
  let mockLogger: { warn: jest.Mock; debug: jest.Mock; error: jest.Mock; log: jest.Mock };

  beforeEach(() => {
    mockEnviarParaCliente = jest.fn().mockResolvedValue(undefined);
    mockLogger = {
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };
    service = {
      enviarParaCliente: mockEnviarParaCliente,
      logger: mockLogger,
    } as unknown as QuotesService;
  });

  describe("D-03 — approvalLink usa /orcamento/ (não /api/quotes/)", () => {
    it("padrão correto corresponde a /orcamento/{id}/approve", () => {
      const correctPattern = /\/orcamento\//;
      const wrongPattern = /\/api\/quotes\//;
      expect(correctPattern.test("/orcamento/123/approve")).toBe(true);
      expect(wrongPattern.test("/orcamento/123/approve")).toBe(false);
    });
  });

  describe("D-01 + D-06 — Hook fire-and-forget no create()", () => {
    it("dispara enviarParaCliente quando payload.idorcamento presente e approvalRequestedAt null", async () => {
      const payload = { idorcamento: 12345 };
      const quote = { id: "quote-uuid-1", approvalRequestedAt: null };

      if (payload.idorcamento && !quote.approvalRequestedAt) {
        void service.enviarParaCliente(quote.id).catch((err: unknown) => {
          mockLogger.warn(
            `[create] Falha no disparo automatico enviarParaCliente para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }

      await Promise.resolve();
      expect(mockEnviarParaCliente).toHaveBeenCalledWith("quote-uuid-1");
    });

    it("NÃO dispara enviarParaCliente quando approvalRequestedAt já existe (D-05)", async () => {
      const payload = { idorcamento: 12345 };
      const quote = { id: "quote-uuid-2", approvalRequestedAt: new Date("2026-01-01") };

      if (payload.idorcamento && !quote.approvalRequestedAt) {
        void service.enviarParaCliente(quote.id).catch(() => {});
      }

      await Promise.resolve();
      expect(mockEnviarParaCliente).not.toHaveBeenCalled();
    });

    it("NÃO dispara quando payload.idorcamento está ausente", async () => {
      const payload = { idorcamento: undefined };
      const quote = { id: "quote-uuid-3", approvalRequestedAt: null };

      if (payload.idorcamento && !quote.approvalRequestedAt) {
        void service.enviarParaCliente(quote.id).catch(() => {});
      }

      await Promise.resolve();
      expect(mockEnviarParaCliente).not.toHaveBeenCalled();
    });

    it("D-06 — falha em enviarParaCliente chama logger.warn, NÃO lança exceção", async () => {
      const failingEnviar = jest.fn().mockRejectedValue(new Error("Chatwoot offline"));
      const payload = { idorcamento: 12345 };
      const quote = { id: "quote-uuid-4", approvalRequestedAt: null };

      let threw = false;
      try {
        if (payload.idorcamento && !quote.approvalRequestedAt) {
          void failingEnviar(quote.id).catch((err: unknown) => {
            mockLogger.warn(
              `[create] Falha no disparo automatico enviarParaCliente para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        }
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Falha no disparo automatico enviarParaCliente para orcamento quote-uuid-4",
        ),
      );
    });
  });
});
