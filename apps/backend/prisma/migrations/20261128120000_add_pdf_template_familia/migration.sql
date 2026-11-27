-- Fase 55 (D-22, D-30): familia de templates de PDF (ORCAMENTO | PROPOSTA).
-- Migracao ADITIVA e IDEMPOTENTE: so cria o enum PdfTemplateFamilia, adiciona a coluna "familia"
-- em PdfTemplate e um indice. O DEFAULT 'ORCAMENTO' faz o backfill das linhas existentes sem
-- reescrever nem apagar dados. Banco do Sistema apenas; nada toca o Athos.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PdfTemplateFamilia') THEN
    CREATE TYPE "PdfTemplateFamilia" AS ENUM ('ORCAMENTO', 'PROPOSTA');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "PdfTemplate" ADD COLUMN IF NOT EXISTS "familia" "PdfTemplateFamilia" NOT NULL DEFAULT 'ORCAMENTO';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PdfTemplate_familia_isActive_idx" ON "PdfTemplate"("familia", "isActive");
