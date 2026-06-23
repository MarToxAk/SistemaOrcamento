/**
 * Seed idempotente dos 3 presets de template PDF (D-06).
 *
 * Execução:
 *   npx ts-node --project apps/backend/tsconfig.json apps/backend/scripts/seed-pdf-templates.ts
 *
 * Comportamento:
 * - Faz upsert por slug para cada preset (idempotente — rodar 2x não duplica).
 * - Marca "colorful" como isActive=true e os demais como isActive=false.
 * - Se o arquivo .hbs de minimal/classic não existir, pula aquele preset com aviso
 *   (tolerância incremental — Plano 04 cria os outros .hbs).
 * - Preserva comportamento atual (colorido ativo => fallback não é necessário).
 */

import { PrismaClient, PdfTemplateKind } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface PresetDefinition {
  slug: string;
  name: string;
  templateFile: string;
  isActive: boolean;
}

const PRESETS: PresetDefinition[] = [
  {
    slug: 'colorful',
    name: 'Colorido',
    templateFile: 'quote-default.hbs',
    isActive: true,
  },
  {
    slug: 'minimal',
    name: 'Minimalista',
    templateFile: 'quote-minimal.hbs',
    isActive: false,
  },
  {
    slug: 'classic',
    name: 'Clássico',
    templateFile: 'quote-classic.hbs',
    isActive: false,
  },
];

async function seed(): Promise<void> {
  const templatesDir = path.resolve(__dirname, '..', 'templates');

  for (const preset of PRESETS) {
    const filePath = path.join(templatesDir, preset.templateFile);

    if (!fs.existsSync(filePath)) {
      console.warn(
        `[seed] Arquivo ${preset.templateFile} não encontrado — pulando preset "${preset.slug}". ` +
          `(Será criado no Plano 04.)`,
      );
      continue;
    }

    const source = fs.readFileSync(filePath, 'utf-8');

    await prisma.pdfTemplate.upsert({
      where: { slug: preset.slug },
      update: {
        name: preset.name,
        source,
        isActive: preset.isActive,
      },
      create: {
        name: preset.name,
        slug: preset.slug,
        source,
        kind: PdfTemplateKind.PRESET,
        isActive: preset.isActive,
      },
    });

    console.log(
      `[seed] Preset "${preset.slug}" upserted (isActive=${preset.isActive}).`,
    );
  }

  console.log('[seed] Seed de templates PDF concluído.');
}

seed()
  .catch((err) => {
    console.error('[seed] Erro ao rodar seed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
