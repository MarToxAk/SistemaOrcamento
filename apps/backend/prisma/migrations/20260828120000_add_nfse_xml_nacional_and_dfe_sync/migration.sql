-- NFS-e nacional: cache do XML assinado (render do DANFSe via nfse-node) + cursor da Distribuicao DF-e do ADN.
ALTER TABLE "NfseEmitida" ADD COLUMN "xmlNacional" TEXT;

CREATE TABLE IF NOT EXISTS "NfseDfeSync" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ultimoNsu" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfseDfeSync_pkey" PRIMARY KEY ("id")
);
