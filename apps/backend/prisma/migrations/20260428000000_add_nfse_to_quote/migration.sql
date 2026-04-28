-- AlterTable: adiciona campos NFS-e ao orçamento
ALTER TABLE "Quote"
  ADD COLUMN "nfseNumero"            TEXT,
  ADD COLUMN "nfseCodigoVerificacao" TEXT,
  ADD COLUMN "nfseEmitidaEm"         TIMESTAMP(3);
