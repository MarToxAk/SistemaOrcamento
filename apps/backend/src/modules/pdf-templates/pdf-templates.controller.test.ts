/**
 * pdf-templates.controller.test.ts
 *
 * Cobre: D-08 (preview retorna PDF sem persistir) e D-03 (proteção por
 * AdminAuthGuard em todos os handlers de escrita/preview).
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { PdfTemplateFamilia } from "@prisma/client";

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
    getFamilia: jest.fn(),
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

  describe("familia de templates (D-22)", () => {
    it("GET sem parametro lista a familia ORCAMENTO", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      (pdfTemplatesService.list as jest.Mock).mockResolvedValue([]);
      const controller = await buildController(pdfTemplatesService, buildMockQuotesPdfStorageService());

      await controller.list();

      expect(pdfTemplatesService.list).toHaveBeenCalledWith(PdfTemplateFamilia.ORCAMENTO);
    });

    it("GET com familia=PROPOSTA lista a familia da proposta", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      (pdfTemplatesService.list as jest.Mock).mockResolvedValue([]);
      const controller = await buildController(pdfTemplatesService, buildMockQuotesPdfStorageService());

      await controller.list("PROPOSTA");

      expect(pdfTemplatesService.list).toHaveBeenCalledWith(PdfTemplateFamilia.PROPOSTA);
    });

    it("GET com familia invalida responde 400 (BadRequestException) e nao consulta o servico", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const controller = await buildController(pdfTemplatesService, buildMockQuotesPdfStorageService());

      expect(() => controller.list("XYZ")).toThrow(BadRequestException);
      expect(pdfTemplatesService.list).not.toHaveBeenCalled();
    });

    it("POST sem familia cria ORCAMENTO", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      (pdfTemplatesService.create as jest.Mock).mockResolvedValue({ id: "t1" });
      const controller = await buildController(pdfTemplatesService, buildMockQuotesPdfStorageService());

      await controller.upload({ name: "Meu", source: "<html></html>" });

      expect(pdfTemplatesService.create).toHaveBeenCalledWith({
        name: "Meu",
        source: "<html></html>",
        familia: PdfTemplateFamilia.ORCAMENTO,
      });
    });

    it("POST com familia PROPOSTA cria PROPOSTA", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      (pdfTemplatesService.create as jest.Mock).mockResolvedValue({ id: "t1" });
      const controller = await buildController(pdfTemplatesService, buildMockQuotesPdfStorageService());

      await controller.upload({ name: "Prop", source: "<html></html>", familia: "PROPOSTA" });

      expect(pdfTemplatesService.create).toHaveBeenCalledWith({
        name: "Prop",
        source: "<html></html>",
        familia: PdfTemplateFamilia.PROPOSTA,
      });
    });

    it("POST com familia invalida responde 400 e nada e criado", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const controller = await buildController(pdfTemplatesService, buildMockQuotesPdfStorageService());

      expect(() => controller.upload({ name: "X", source: "<html></html>", familia: "OUTRA" })).toThrow(
        BadRequestException,
      );
      expect(pdfTemplatesService.create).not.toHaveBeenCalled();
    });

    it("PATCH :id/activate continua delegando ao servico (escopo por familia fica no servico)", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      (pdfTemplatesService.activate as jest.Mock).mockResolvedValue({ id: "t1" });
      const controller = await buildController(pdfTemplatesService, buildMockQuotesPdfStorageService());

      await controller.activate("t1");

      expect(pdfTemplatesService.activate).toHaveBeenCalledWith("t1");
    });

    it("preview com templateId de template PROPOSTA responde 400 orientando o preview de propostas", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const quotesPdfStorageService = buildMockQuotesPdfStorageService();
      (pdfTemplatesService.getFamilia as jest.Mock).mockResolvedValue(PdfTemplateFamilia.PROPOSTA);
      const controller = await buildController(pdfTemplatesService, quotesPdfStorageService);
      const res = buildMockResponse();

      await controller.preview({ templateId: "tpl-proposta" }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.stringContaining("/propostas/templates/preview"),
      });
      expect(quotesPdfStorageService.renderPreviewPdf).not.toHaveBeenCalled();
      expect(pdfTemplatesService.getSource).not.toHaveBeenCalled();
    });

    it("preview com templateId de template ORCAMENTO segue gerando o PDF", async () => {
      const pdfTemplatesService = buildMockPdfTemplatesService();
      const quotesPdfStorageService = buildMockQuotesPdfStorageService();
      (pdfTemplatesService.getFamilia as jest.Mock).mockResolvedValue(PdfTemplateFamilia.ORCAMENTO);
      (pdfTemplatesService.getSource as jest.Mock).mockResolvedValue("<html>orc</html>");
      (quotesPdfStorageService.renderPreviewPdf as jest.Mock).mockResolvedValue(Buffer.from("%PDF"));
      const controller = await buildController(pdfTemplatesService, quotesPdfStorageService);
      const res = buildMockResponse();

      await controller.preview({ templateId: "tpl-orc" }, res);

      expect(quotesPdfStorageService.renderPreviewPdf).toHaveBeenCalledWith(expect.any(Object), "<html>orc</html>");
      expect(res.send).toHaveBeenCalled();
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
