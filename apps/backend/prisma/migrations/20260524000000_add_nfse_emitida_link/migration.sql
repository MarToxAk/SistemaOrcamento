-- Add linkNfse column to NfseEmitida for storing the download link from IIBR API
ALTER TABLE "NfseEmitida" ADD COLUMN IF NOT EXISTS "linkNfse" TEXT;
