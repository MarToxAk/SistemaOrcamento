/*
  Warnings:

  - The `source` column on the `Customer` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `externalConversationId` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the column `originChannel` on the `Quote` table. All the data in the column will be lost.
  - The `status` column on the `Quote` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `lineTotal` on the `QuoteItem` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `QuoteItem` table. All the data in the column will be lost.
  - You are about to drop the column `changedBy` on the `QuoteStatusHistory` table. All the data in the column will be lost.
  - The `oldStatus` column on the `QuoteStatusHistory` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[externalSystem,externalId,entityType]` on the table `ExternalReference` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[internalNumber]` on the table `Quote` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `externalSystem` on the `ExternalReference` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `finalPrice` to the `QuoteItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sequence` to the `QuoteItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shortDescription` to the `QuoteItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `changedByName` to the `QuoteStatusHistory` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `newStatus` on the `QuoteStatusHistory` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'PDV', 'CHATWOOT');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('MANUAL', 'PDV');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDENTE', 'APROVADO', 'EM_PRODUCAO', 'PRONTO_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VENDEDOR', 'ATENDENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "ExternalSystem" AS ENUM ('PDV', 'CHATWOOT');

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_customerId_fkey";

-- DropIndex
DROP INDEX "Quote_externalConversationId_idx";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "chatwootContactId" BIGINT,
DROP COLUMN "source",
ADD COLUMN     "source" "DataSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "ExternalReference" DROP COLUMN "externalSystem",
ADD COLUMN     "externalSystem" "ExternalSystem" NOT NULL;

-- AlterTable
ALTER TABLE "Quote" DROP COLUMN "externalConversationId",
DROP COLUMN "originChannel",
ADD COLUMN     "budgetDate" TIMESTAMP(3),
ADD COLUMN     "chatwootContactId" BIGINT,
ADD COLUMN     "conversationId" BIGINT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "externalQuoteId" BIGINT,
ADD COLUMN     "internalNumber" SERIAL NOT NULL,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "sellerExternalId" BIGINT,
ADD COLUMN     "sellerName" TEXT,
ADD COLUMN     "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "surcharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "validity" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "QuoteStatus" NOT NULL DEFAULT 'PENDENTE',
ALTER COLUMN "subtotal" SET DEFAULT 0,
ALTER COLUMN "discount" SET DEFAULT 0,
ALTER COLUMN "total" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "QuoteItem" DROP COLUMN "lineTotal",
DROP COLUMN "sku",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "externalItemId" BIGINT,
ADD COLUMN     "finalPrice" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "parentItemId" TEXT,
ADD COLUMN     "priceSource" "PriceSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "productExternalId" BIGINT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "sequence" INTEGER NOT NULL,
ADD COLUMN     "shortDescription" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "QuoteStatusHistory" DROP COLUMN "changedBy",
ADD COLUMN     "changedById" TEXT,
ADD COLUMN     "changedByName" TEXT NOT NULL,
DROP COLUMN "oldStatus",
ADD COLUMN     "oldStatus" "QuoteStatus",
DROP COLUMN "newStatus",
ADD COLUMN     "newStatus" "QuoteStatus" NOT NULL;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VENDEDOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteStampItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "stampType" TEXT NOT NULL,
    "dimensions" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteStampItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteDocument" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "QuoteStampItem_quoteId_number_idx" ON "QuoteStampItem"("quoteId", "number");

-- CreateIndex
CREATE INDEX "QuoteDocument_quoteId_generatedAt_idx" ON "QuoteDocument"("quoteId", "generatedAt");

-- CreateIndex
CREATE INDEX "ExternalReference_externalSystem_externalId_idx" ON "ExternalReference"("externalSystem", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReference_externalSystem_externalId_entityType_key" ON "ExternalReference"("externalSystem", "externalId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_internalNumber_key" ON "Quote"("internalNumber");

-- CreateIndex
CREATE INDEX "Quote_status_updatedAt_idx" ON "Quote"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Quote_externalQuoteId_idx" ON "Quote"("externalQuoteId");

-- CreateIndex
CREATE INDEX "Quote_conversationId_idx" ON "Quote"("conversationId");

-- CreateIndex
CREATE INDEX "Quote_chatwootContactId_idx" ON "Quote"("chatwootContactId");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_sequence_idx" ON "QuoteItem"("quoteId", "sequence");

-- CreateIndex
CREATE INDEX "QuoteItem_parentItemId_idx" ON "QuoteItem"("parentItemId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "QuoteItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteStampItem" ADD CONSTRAINT "QuoteStampItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteStatusHistory" ADD CONSTRAINT "QuoteStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteDocument" ADD CONSTRAINT "QuoteDocument_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
