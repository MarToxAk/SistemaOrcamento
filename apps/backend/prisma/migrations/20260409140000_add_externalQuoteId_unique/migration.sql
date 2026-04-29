-- Migration: adicionar constraint única em externalQuoteId
-- Atenção: se existirem valores duplicados em externalQuoteId, essa migration pode falhar.
-- Recomenda-se verificar duplicatas antes de aplicar.

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_externalQuoteId_unique" UNIQUE ("externalQuoteId");
