/**
 * pdf-templates.seed.test.ts
 *
 * Testa o script REAL de seed (importado por caminho relativo) com Prisma
 * falso e diretorio temporario de templates (Pitfall 6, T-55-16):
 *  - importar o modulo nao tem efeito colateral;
 *  - presets ORCAMENTO mantem o upsert atual (update com isActive);
 *  - preset PROPOSTA grava isActive SOMENTE no create (o boot do container
 *    nao pode desfazer a escolha do operador);
 *  - preset cujo arquivo nao existe e pulado com aviso.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PdfTemplateFamilia, PdfTemplateKind } from "@prisma/client";

import { PRESETS, seedPresets } from "../../../scripts/seed-pdf-templates";

type UpsertArgs = {
  where: { slug: string };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

function buildFakePrisma() {
  const upsert = jest.fn(async (_args: UpsertArgs) => ({}));
  return { prisma: { pdfTemplate: { upsert } }, upsert };
}

function upsertFor(upsert: jest.Mock, slug: string): UpsertArgs {
  const call = upsert.mock.calls.find(([args]) => (args as UpsertArgs).where.slug === slug);
  if (!call) throw new Error(`upsert nao chamado para ${slug}`);
  return call[0] as UpsertArgs;
}

describe("seed-pdf-templates (script real)", () => {
  let dir: string;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const write = (file: string, content = `<html>${file}</html>`) =>
    fs.writeFileSync(path.join(dir, file), content, "utf-8");

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-pdf-"));
    write("quote-default.hbs");
    write("quote-minimal.hbs");
    write("quote-classic.hbs");
    write("proposta-institucional.hbs");
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("importar o modulo nao instancia PrismaClient, nao chama process.exit e nao imprime nada", () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const stdoutSpy = jest.spyOn(console, "log");
    const stderrSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const prismaClientMock = jest.fn();

    jest.isolateModules(() => {
      jest.doMock("@prisma/client", () => ({
        ...jest.requireActual("@prisma/client"),
        PrismaClient: prismaClientMock,
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../../../scripts/seed-pdf-templates");
    });
    jest.dontMock("@prisma/client");

    expect(prismaClientMock).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("faz upsert por slug de cada preset cujo arquivo existe", async () => {
    const { prisma, upsert } = buildFakePrisma();

    await seedPresets(prisma as never, dir);

    expect(upsert).toHaveBeenCalledTimes(4);
    expect(upsert.mock.calls.map(([a]) => (a as UpsertArgs).where.slug).sort()).toEqual(
      ["classic", "colorful", "minimal", "proposta-institucional"].sort(),
    );
  });

  it("presets ORCAMENTO mantem o upsert atual: update com name, source e isActive; create PRESET/ORCAMENTO", async () => {
    const { prisma, upsert } = buildFakePrisma();

    await seedPresets(prisma as never, dir);

    for (const slug of ["colorful", "minimal", "classic"]) {
      const args = upsertFor(upsert, slug);
      expect(Object.keys(args.update).sort()).toEqual(["isActive", "name", "source"]);
      expect(args.create).toEqual(
        expect.objectContaining({
          slug,
          kind: PdfTemplateKind.PRESET,
          familia: PdfTemplateFamilia.ORCAMENTO,
        }),
      );
    }

    const ativosOrcamento = PRESETS.filter((p) => p.familia === PdfTemplateFamilia.ORCAMENTO && p.isActive);
    expect(ativosOrcamento.map((p) => p.slug)).toEqual(["colorful"]);
    expect(upsertFor(upsert, "colorful").update.isActive).toBe(true);
    expect(upsertFor(upsert, "minimal").update.isActive).toBe(false);
    expect(upsertFor(upsert, "classic").update.isActive).toBe(false);
  });

  it("preset PROPOSTA: update NAO contem isActive nem familia; create tem PRESET, PROPOSTA e isActive true", async () => {
    const { prisma, upsert } = buildFakePrisma();

    await seedPresets(prisma as never, dir);

    const args = upsertFor(upsert, "proposta-institucional");
    expect(args.update).not.toHaveProperty("isActive");
    expect(args.update).not.toHaveProperty("familia");
    expect(Object.keys(args.update).sort()).toEqual(["name", "source"]);
    expect(args.create).toEqual(
      expect.objectContaining({
        slug: "proposta-institucional",
        kind: PdfTemplateKind.PRESET,
        familia: PdfTemplateFamilia.PROPOSTA,
        isActive: true,
      }),
    );
  });

  it("segunda execucao nao altera isActive do preset PROPOSTA (update identico, sem a chave)", async () => {
    const { prisma, upsert } = buildFakePrisma();

    await seedPresets(prisma as never, dir);
    await seedPresets(prisma as never, dir);

    const chamadas = upsert.mock.calls
      .map(([a]) => a as UpsertArgs)
      .filter((a) => a.where.slug === "proposta-institucional");
    expect(chamadas).toHaveLength(2);
    for (const c of chamadas) {
      expect(c.update).not.toHaveProperty("isActive");
    }
  });

  it("com o arquivo do preset PROPOSTA ausente, pula com aviso e os demais seguem", async () => {
    fs.rmSync(path.join(dir, "proposta-institucional.hbs"));
    const { prisma, upsert } = buildFakePrisma();

    await seedPresets(prisma as never, dir);

    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls.map(([a]) => (a as UpsertArgs).where.slug)).not.toContain("proposta-institucional");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("proposta-institucional"));
  });
});
