/**
 * pdf-templates.familia.test.ts
 *
 * Tracer da fase 55 (D-22, D-30, Pitfall 5): ativar um template de uma
 * familia (ORCAMENTO | PROPOSTA) nao pode desativar o ativo da outra.
 * Usa um Prisma em memoria com o servico e o repositorio REAIS.
 */

import { Test } from "@nestjs/testing";
import { PdfTemplateFamilia, PdfTemplateKind } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { PdfTemplatesRepository } from "./pdf-templates.repository";
import { PdfTemplatesService } from "./pdf-templates.service";

interface Row {
  id: string;
  name: string;
  slug: string;
  source: string;
  kind: PdfTemplateKind;
  familia: PdfTemplateFamilia;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type Where = Partial<Pick<Row, "id" | "isActive" | "familia" | "slug">> | undefined;

function matches(row: Row, where: Where): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value);
}

function buildInMemoryPrisma() {
  const rows: Row[] = [];
  let seq = 0;
  let clock = 1_700_000_000_000;

  const tick = () => new Date((clock += 1000));

  const pdfTemplate = {
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      seq += 1;
      const now = tick();
      const row: Row = {
        id: `tpl-${seq}`,
        name: data.name as string,
        slug: data.slug as string,
        source: data.source as string,
        kind: data.kind as PdfTemplateKind,
        familia: (data.familia ?? PdfTemplateFamilia.ORCAMENTO) as PdfTemplateFamilia,
        isActive: data.isActive ?? false,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return { ...row };
    }),
    findUnique: jest.fn(async ({ where }: { where: Where }) => {
      const found = rows.find((r) => matches(r, where));
      return found ? { ...found } : null;
    }),
    findFirst: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where?: Where;
        orderBy?: { updatedAt?: "asc" | "desc" };
        select?: unknown;
      }) => {
        let found = rows.filter((r) => matches(r, where));
        if (orderBy?.updatedAt) {
          const dir = orderBy.updatedAt === "desc" ? -1 : 1;
          found = [...found].sort((a, b) => dir * (a.updatedAt.getTime() - b.updatedAt.getTime()));
        }
        return found[0] ? { ...found[0] } : null;
      },
    ),
    findMany: jest.fn(async ({ where }: { where?: Where }) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
    update: jest.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error("not found");
      Object.assign(row, data, { updatedAt: tick() });
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: { where?: Where; data: Partial<Row> }) => {
      const targets = rows.filter((r) => matches(r, where));
      targets.forEach((r) => Object.assign(r, data, { updatedAt: tick() }));
      return { count: targets.length };
    }),
  };

  const prisma = {
    pdfTemplate,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  return { prisma, rows };
}

const SOURCE_ORCAMENTO_A = "<html><body>orcamento A {{cliente.nome}}</body></html>";
const SOURCE_PROPOSTA_B = "<html><body>proposta B {{cliente.nome}}</body></html>";
const SOURCE_PROPOSTA_C = "<html><body>proposta C {{cliente.nome}}</body></html>";

async function build() {
  const { prisma, rows } = buildInMemoryPrisma();
  const module = await Test.createTestingModule({
    providers: [PdfTemplatesService, PdfTemplatesRepository, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return {
    service: module.get(PdfTemplatesService),
    repository: module.get(PdfTemplatesRepository),
    rows,
  };
}

describe("PdfTemplates por familia (D-22, D-30)", () => {
  it("ativar PROPOSTA nao desativa o ORCAMENTO ativo e a resolucao e por familia", async () => {
    const { service, repository } = await build();

    const a = await service.create({ name: "Orcamento A", source: SOURCE_ORCAMENTO_A });
    expect(a.familia).toBe(PdfTemplateFamilia.ORCAMENTO);
    await service.activate(a.id);

    const b = await service.create({
      name: "Proposta B",
      source: SOURCE_PROPOSTA_B,
      familia: PdfTemplateFamilia.PROPOSTA,
    });
    expect(b.familia).toBe(PdfTemplateFamilia.PROPOSTA);
    expect(b.isActive).toBe(false);
    const ativadoB = await service.activate(b.id);
    expect(ativadoB.isActive).toBe(true);

    // O template ORCAMENTO continua ativo depois de ativar um PROPOSTA.
    const listaOrcamento = await service.list();
    expect(listaOrcamento).toHaveLength(1);
    expect(listaOrcamento[0].id).toBe(a.id);
    expect(listaOrcamento[0].isActive).toBe(true);

    expect(await repository.getActiveSource()).toBe(SOURCE_ORCAMENTO_A);
    expect(await repository.getActiveSource(PdfTemplateFamilia.ORCAMENTO)).toBe(SOURCE_ORCAMENTO_A);
    expect(await repository.getActiveSource(PdfTemplateFamilia.PROPOSTA)).toBe(SOURCE_PROPOSTA_B);
  });

  it("ativar um segundo PROPOSTA desativa o primeiro e mantem o ORCAMENTO ativo", async () => {
    const { service, repository } = await build();

    const a = await service.create({ name: "Orcamento A", source: SOURCE_ORCAMENTO_A });
    await service.activate(a.id);
    const b = await service.create({
      name: "Proposta B",
      source: SOURCE_PROPOSTA_B,
      familia: PdfTemplateFamilia.PROPOSTA,
    });
    await service.activate(b.id);
    const c = await service.create({
      name: "Proposta C",
      source: SOURCE_PROPOSTA_C,
      familia: PdfTemplateFamilia.PROPOSTA,
    });
    await service.activate(c.id);

    const propostas = await service.list(PdfTemplateFamilia.PROPOSTA);
    expect(propostas.map((t) => t.id).sort()).toEqual([b.id, c.id].sort());
    expect(propostas.find((t) => t.id === b.id)?.isActive).toBe(false);
    expect(propostas.find((t) => t.id === c.id)?.isActive).toBe(true);

    const orcamentos = await service.list();
    expect(orcamentos.every((t) => t.familia === PdfTemplateFamilia.ORCAMENTO)).toBe(true);
    expect(orcamentos.find((t) => t.id === a.id)?.isActive).toBe(true);

    expect(await repository.getActiveSource(PdfTemplateFamilia.PROPOSTA)).toBe(SOURCE_PROPOSTA_C);
    expect(await repository.getActiveSource()).toBe(SOURCE_ORCAMENTO_A);
  });

  it("ativar ORCAMENTO tambem nao desativa o PROPOSTA ativo (sentido inverso)", async () => {
    const { service, repository } = await build();

    const b = await service.create({
      name: "Proposta B",
      source: SOURCE_PROPOSTA_B,
      familia: PdfTemplateFamilia.PROPOSTA,
    });
    await service.activate(b.id);
    const a = await service.create({ name: "Orcamento A", source: SOURCE_ORCAMENTO_A });
    await service.activate(a.id);

    expect(await repository.getActiveSource(PdfTemplateFamilia.PROPOSTA)).toBe(SOURCE_PROPOSTA_B);
    expect(await repository.getActiveSource()).toBe(SOURCE_ORCAMENTO_A);
  });

  it("getActiveSource devolve null quando a familia nao tem template ativo", async () => {
    const { service, repository } = await build();
    const a = await service.create({ name: "Orcamento A", source: SOURCE_ORCAMENTO_A });
    await service.activate(a.id);

    expect(await repository.getActiveSource(PdfTemplateFamilia.PROPOSTA)).toBeNull();
  });

  it("getActiveSource e deterministico: com dois ativos por engano, o mais recentemente atualizado vence", async () => {
    const { service, repository, rows } = await build();
    const b = await service.create({
      name: "Proposta B",
      source: SOURCE_PROPOSTA_B,
      familia: PdfTemplateFamilia.PROPOSTA,
    });
    const c = await service.create({
      name: "Proposta C",
      source: SOURCE_PROPOSTA_C,
      familia: PdfTemplateFamilia.PROPOSTA,
    });
    // Simula inconsistencia: ambos ativos, C atualizado depois.
    const rowB = rows.find((r) => r.id === b.id)!;
    const rowC = rows.find((r) => r.id === c.id)!;
    rowB.isActive = true;
    rowC.isActive = true;
    rowB.updatedAt = new Date(2026, 0, 1);
    rowC.updatedAt = new Date(2026, 5, 1);

    expect(await repository.getActiveSource(PdfTemplateFamilia.PROPOSTA)).toBe(SOURCE_PROPOSTA_C);
  });

  it("getFamilia devolve a familia do template e 404 quando nao existe", async () => {
    const { service } = await build();
    const b = await service.create({
      name: "Proposta B",
      source: SOURCE_PROPOSTA_B,
      familia: PdfTemplateFamilia.PROPOSTA,
    });

    await expect(service.getFamilia(b.id)).resolves.toBe(PdfTemplateFamilia.PROPOSTA);
    await expect(service.getFamilia("inexistente")).rejects.toThrow("não encontrado");
  });
});
