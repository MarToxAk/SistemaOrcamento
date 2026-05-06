-- DropIndex
DROP INDEX "Quote_externalQuoteId_idx";

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "paymentNote" TEXT;

-- RenameIndex
ALTER INDEX "Quote_externalQuoteId_unique" RENAME TO "Quote_externalQuoteId_key";
