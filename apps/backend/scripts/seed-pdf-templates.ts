/**
 * Seed idempotente dos presets de template PDF (D-06, D-22).
 *
 * Execução:
 *   npx ts-node --project apps/backend/tsconfig.json apps/backend/scripts/seed-pdf-templates.ts
 *
 * Comportamento:
 * - Faz upsert por slug para cada preset (idempotente — rodar 2x não duplica).
 * - Família ORCAMENTO: marca "colorful" como isActive=true e os demais como
 *   isActive=false A CADA execução (comportamento histórico preservado). Dívida
 *   registrada, fora do escopo da fase 55: isso reativa o "colorful" a cada
 *   boot do container, desfazendo a escolha do operador na família ORCAMENTO.
 * - Família PROPOSTA: isActive é gravado SOMENTE no create. O update só mexe em
 *   name e source — o operador pode ativar outro template de proposta e o boot
 *   do container (que roda este seed a cada start) não pode desfazer essa
 *   escolha (Pitfall 6).
 * - Se o arquivo .hbs de um preset não existir, pula aquele preset com aviso
 *   (tolerância incremental — ex.: proposta-institucional.hbs é criado no
 *   Plano 55-07).
 * - Importar este módulo não tem efeito colateral: o PrismaClient só é criado
 *   apenas na execução direta do script (guarda no fim do arquivo).
 */

import { PrismaClient, PdfTemplateFamilia, PdfTemplateKind } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export interface PresetDefinition {
  slug: string;
  name: string;
  templateFile: string;
  isActive: boolean;
  familia: PdfTemplateFamilia;
}

export const PRESETS: PresetDefinition[] = [
  {
    slug: 'colorful',
    name: 'Colorido',
    templateFile: 'quote-default.hbs',
    isActive: true,
    familia: PdfTemplateFamilia.ORCAMENTO,
  },
  {
    slug: 'minimal',
    name: 'Minimalista',
    templateFile: 'quote-minimal.hbs',
    isActive: false,
    familia: PdfTemplateFamilia.ORCAMENTO,
  },
  {
    slug: 'classic',
    name: 'Clássico',
    templateFile: 'quote-classic.hbs',
    isActive: false,
    familia: PdfTemplateFamilia.ORCAMENTO,
  },
  {
    slug: 'proposta-institucional',
    name: 'Proposta institucional',
    templateFile: 'proposta-institucional.hbs',
    isActive: true,
    familia: PdfTemplateFamilia.PROPOSTA,
  },
];

/** Subconjunto do PrismaClient usado pelo seed (facilita o teste). */
export type SeedPrisma = Pick<PrismaClient, 'pdfTemplate'>;

export async function seedPresets(prisma: SeedPrisma, templatesDir: string): Promise<void> {
  for (const preset of PRESETS) {
    const filePath = path.join(templatesDir, preset.templateFile);

    if (!fs.existsSync(filePath)) {
      console.warn(
        `[seed] Arquivo ${preset.templateFile} não encontrado — pulando preset "${preset.slug}". ` +
          `(Será criado em um plano posterior.)`,
      );
      continue;
    }

    const source = fs.readFileSync(filePath, 'utf-8');

    // PROPOSTA: isActive só no create (Pitfall 6). ORCAMENTO: comportamento atual.
    const update =
      preset.familia === PdfTemplateFamilia.PROPOSTA
        ? { name: preset.name, source }
        : { name: preset.name, source, isActive: preset.isActive };

    await prisma.pdfTemplate.upsert({
      where: { slug: preset.slug },
      update,
      create: {
        name: preset.name,
        slug: preset.slug,
        source,
        kind: PdfTemplateKind.PRESET,
        familia: preset.familia,
        isActive: preset.isActive,
      },
    });

    console.log(
      `[seed] Preset "${preset.slug}" upserted (familia=${preset.familia}, isActive=${preset.isActive}).`,
    );
  }

  console.log('[seed] Seed de templates PDF concluído.');
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedPresets(prisma, path.resolve(__dirname, '..', 'templates'));
  } catch (err) {
    console.error('[seed] Erro ao rodar seed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
