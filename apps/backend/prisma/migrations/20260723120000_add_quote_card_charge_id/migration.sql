-- Migration: adicionar Quote.cardChargeId (webhook de confirmacao de pagamento por cartao)

ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "cardChargeId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quote_cardChargeId_key') THEN
    ALTER TABLE "Quote" ADD CONSTRAINT "Quote_cardChargeId_key" UNIQUE ("cardChargeId");
  END IF;
END $$;
