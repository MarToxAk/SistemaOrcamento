-- Log de envio de e-mail ao cliente (boleto + NFS-e + NF-e XML) com verificacao de leitura.
-- status: enviado | aberto | confirmado. Token opaco por envio (pixel 1x1 + link de confirmacao).
CREATE TABLE IF NOT EXISTS "CobrancaEmailEnvio" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "idclienteAthos" INTEGER NOT NULL,
    "destinatario" TEXT NOT NULL,
    "assunto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enviado',
    "cobrancaBoletoId" INTEGER,
    "nfseEmitidaIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "nfeNumeros" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abertoEm" TIMESTAMP(3),
    "confirmadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CobrancaEmailEnvio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CobrancaEmailEnvio_token_key" ON "CobrancaEmailEnvio"("token");
CREATE INDEX IF NOT EXISTS "CobrancaEmailEnvio_idclienteAthos_idx" ON "CobrancaEmailEnvio"("idclienteAthos");
CREATE INDEX IF NOT EXISTS "CobrancaEmailEnvio_cobrancaBoletoId_idx" ON "CobrancaEmailEnvio"("cobrancaBoletoId");

ALTER TABLE "CobrancaEmailEnvio" ADD CONSTRAINT "CobrancaEmailEnvio_cobrancaBoletoId_fkey"
    FOREIGN KEY ("cobrancaBoletoId") REFERENCES "CobrancaBoleto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
