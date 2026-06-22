-- CreateEnum
CREATE TYPE "PdfTemplateKind" AS ENUM ('PRESET', 'CUSTOM');

-- CreateTable
CREATE TABLE "PdfTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" "PdfTemplateKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfTemplate_slug_key" ON "PdfTemplate"("slug");

-- CreateIndex
CREATE INDEX "PdfTemplate_isActive_idx" ON "PdfTemplate"("isActive");
