-- CreateTable (idempotent: only if not exists from previous migration)
CREATE TABLE IF NOT EXISTS "NfseEmitida" (
    "id" SERIAL NOT NULL,
    "numeroNfse" TEXT,
    "numeroRps" INTEGER NOT NULL,
    "idclienteAthos" INTEGER NOT NULL,
    "valorServico" DECIMAL(12,2) NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NfseEmitida_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent: only if not exists from previous migration)
CREATE TABLE IF NOT EXISTS "NfseEmitidaTitulo" (
    "id" SERIAL NOT NULL,
    "nfseEmitidaId" INTEGER NOT NULL,
    "idcontareceber" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "NfseEmitidaTitulo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "NfseEmitidaTitulo_nfseEmitidaId_idx" ON "NfseEmitidaTitulo"("nfseEmitidaId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "NfseEmitidaTitulo_idcontareceber_idx" ON "NfseEmitidaTitulo"("idcontareceber");

-- AddForeignKey (idempotent check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NfseEmitidaTitulo_nfseEmitidaId_fkey'
  ) THEN
    ALTER TABLE "NfseEmitidaTitulo" ADD CONSTRAINT "NfseEmitidaTitulo_nfseEmitidaId_fkey"
      FOREIGN KEY ("nfseEmitidaId") REFERENCES "NfseEmitida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: add idvenda column if not exists
ALTER TABLE "NfseEmitida" ADD COLUMN IF NOT EXISTS "idvenda" INTEGER;

-- CreateIndex for idvenda (idempotent)
CREATE INDEX IF NOT EXISTS "NfseEmitida_idvenda_idx" ON "NfseEmitida"("idvenda");
