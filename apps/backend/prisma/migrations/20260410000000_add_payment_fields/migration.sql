-- Migration: adicionar campos de pagamento, saleExternalId, PaymentTransaction
-- e novos valores de enum QuoteStatus que estavam no schema mas sem migration

-- Novos valores no enum QuoteStatus
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'ENVIADO';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'PAGAMENTO_PARCIAL';

-- Colunas faltando na tabela Quote
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "saleExternalId" BIGINT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentSource" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentExternalId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentEventId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentAmount" DECIMAL(12,2);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paidTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "pendingTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "firstInstallmentAmount" DECIMAL(12,2);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "secondInstallmentAmount" DECIMAL(12,2);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "secondInstallmentExternalId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentFailedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentFailureReason" TEXT;

-- Unique constraints em Quote (usando DO/IF NOT EXISTS para idempotência)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quote_paymentExternalId_key') THEN
    ALTER TABLE "Quote" ADD CONSTRAINT "Quote_paymentExternalId_key" UNIQUE ("paymentExternalId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quote_paymentEventId_key') THEN
    ALTER TABLE "Quote" ADD CONSTRAINT "Quote_paymentEventId_key" UNIQUE ("paymentEventId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quote_secondInstallmentExternalId_key') THEN
    ALTER TABLE "Quote" ADD CONSTRAINT "Quote_secondInstallmentExternalId_key" UNIQUE ("secondInstallmentExternalId");
  END IF;
END $$;

-- Índices em Quote
CREATE INDEX IF NOT EXISTS "Quote_saleExternalId_idx" ON "Quote"("saleExternalId");
CREATE INDEX IF NOT EXISTS "Quote_paymentSource_paymentMethod_idx" ON "Quote"("paymentSource", "paymentMethod");
CREATE INDEX IF NOT EXISTS "Quote_paymentConfirmedAt_idx" ON "Quote"("paymentConfirmedAt");

-- Tabela PaymentTransaction (estava no schema mas nunca teve migration)
CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "externalId" TEXT,
    "eventId" TEXT,
    "source" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "metadata" JSONB,
    "webhookPayload" JSONB,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentTransaction_externalId_key') THEN
    ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_externalId_key" UNIQUE ("externalId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentTransaction_eventId_key') THEN
    ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_eventId_key" UNIQUE ("eventId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PaymentTransaction_quoteId_processedAt_idx" ON "PaymentTransaction"("quoteId", "processedAt");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_source_method_status_idx" ON "PaymentTransaction"("source", "method", "status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentTransaction_quoteId_fkey') THEN
    ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
