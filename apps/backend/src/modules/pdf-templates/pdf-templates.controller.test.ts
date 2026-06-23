/**
 * pdf-templates.controller.test.ts
 *
 * Cobre: D-08 (preview retorna PDF sem persistir) e D-03 (proteção por
 * AdminAuthGuard em todos os handlers de escrita/preview).
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AdminAuthGuard } from "../security/admin-auth.guard";
import { QuotesPdfStorageService } from "../quotes/quotes-pdf-storage.service";
import { PdfTemplatesController } from "./pdf-templates.controller";
import { PdfTemplatesService } from "./pdf-templates.service";

function buildMockPdfTemplatesService() {
  return {
    list: jest.fn(),
    create: jest.fn(),
    activate: jest.fn(),
    remove: jest.fn(),
    getSource: jest.fn(),
  } as unknown as PdfTemplatesService;
}

function buildMockQuotesPdfStorageService() {
  return {
    renderPreviewPdf: jest.fn(),
  } as unknown as QuotesPdfStorageService;
}

function buildMockResponse() {
  const headers: Record<string, unknown> = {};
  const res: Record<string, unknown> = {
    setHeader: jest.fn((key: string, value: unknown) => {
      headers[key] = value;
    }),
    send: jest.fn(),
    json: jest.fn(),
    _headers: headers,
  };
  res.status = jest.fn(() => res);
  return res;
}

async function buildController(
  pdfTemplatesService: ReturnType<typeof buildMockPdfTemplatesService>,
  quotesPdfStorageService: ReturnType<typeof buildMockQuotesPdfStorageService>,
) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [PdfTemplatesController],
    providers: [
      { provide: PdfTemplatesService, useValue: pdfTemplatesService },
      { provide: QuotesPdfStorageService, useValue: quotesPdfStorageService },
      // AdminAuthGuard é resolvido pelo Nest mesmo em teste unitário do
      // controller (metadata de @UseGuards é instanciada no module graph).
      { provide: ConfigService, useValue: { get: jest.fn() } },
    ],
  }).compile();

  return module.get<PdfTemplatesController>(PdfTemplatesController);
}

describe("PdfTemplatesController", () => {
  describe("preview de template (D-08)", () => {
    it("POST /pdf-templates/preview retorna buffer PDF sem persistir nada no banco", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const quotesPdfStorageService = buildMockQuotesPdfStorageService();
      const fakePdfBuffer = Buffer.from("%PDF-1.4 fake content");
      (quotesPdfStorageService.renderPreviewPdf as jest.Mock).mockResolvedValue(fakePdfBuffer);

      const controller = await buildController(pdfTemplatesService, quotesPdfStorageService);
      const res = buildMockResponse();

      await controller.preview({ source: "<html>{{empresaNome}}</html>" }, res);

      expect(quotesPdfStorageService.renderPreviewPdf).toHaveBeenCalledWith(
        expect.any(Object),
        "<html>{{empresaNome}}</html>",
      );
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
      expect(res.send).toHaveBeenCalledWith(fakePdfBuffer);

      // Garante que nenhum método de persistência (create/activate) foi chamado pelo preview
      expect(pdfTemplatesService.create).not.toHaveBeenCalled();
      expect(pdfTemplatesService.activate).not.toHaveBeenCalled();
    });

    it("preview usa dados de orçamento de exemplo (mock) para preencher o template", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const quotesPdfStorageService = buildMockQuotesPdfStorageService();
      (quotesPdfStorageService.renderPreviewPdf as jest.Mock).mockResolvedValue(Buffer.from(""));

      const controller = await buildController(pdfTemplatesService, quotesPdfStorageService);
      const res = buildMockResponse();

      await controller.preview({ source: "<html></html>" }, res);

      const [mockPayload] = (quotesPdfStorageService.renderPreviewPdf as jest.Mock).mock.calls[0];
      expect(mockPayload).toHaveProperty("idorcamento");
      expect(mockPayload).toHaveProperty("cliente");
      expect(mockPayload).toHaveProperty("itens");
      expect(Array.isArray(mockPayload.itens)).toBe(true);
    });

    it("preview com templateId busca o source salvo via getSource antes de renderizar", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const quotesPdfStorageService = buildMockQuotesPdfStorageService();
      (pdfTemplatesService.getSource as jest.Mock).mockResolvedValue("<html>preset salvo</html>");
      (quotesPdfStorageService.renderPreviewPdf as jest.Mock).mockResolvedValue(Buffer.from("%PDF"));

      const controller = await buildController(pdfTemplatesService, quotesPdfStorageService);
      const res = buildMockResponse();

      await controller.preview({ templateId: "template-123" }, res);

      expect(pdfTemplatesService.getSource).toHaveBeenCalledWith("template-123");
      expect(quotesPdfStorageService.renderPreviewPdf).toHaveBeenCalledWith(
        expect.any(Object),
        "<html>preset salvo</html>",
      );
      expect(res.send).toHaveBeenCalled();
    });

    it("preview sem source e sem templateId retorna 400 e nao chama o render", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const quotesPdfStorageService = buildMockQuotesPdfStorageService();

      const controller = await buildController(pdfTemplatesService, quotesPdfStorageService);
      const res = buildMockResponse();

      await controller.preview({}, res);

      expect(quotesPdfStorageService.renderPreviewPdf).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      );
    });
  });

  describe("proteção por AdminAuthGuard (D-03)", () => {
    it.each([
      ["list", "GET /"],
      ["upload", "POST /"],
      ["activate", "PATCH /:id/activate"],
      ["remove", "DELETE /:id"],
      ["preview", "POST /preview"],
    ])("handler %s (%s) está protegido por AdminAuthGuard", (methodName) => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        PdfTemplatesController.prototype[methodName as keyof PdfTemplatesController],
      );

      expect(guards).toBeDefined();
      expect(guards).toContain(AdminAuthGuard);
    });
  });
});
