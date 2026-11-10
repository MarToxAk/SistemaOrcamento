-- Fase 45 (D-05): registro idempotente dos avisos de vencimento/atraso por boleto.
-- Aditiva e idempotente (regra da Fase 09). Banco do Sistema apenas; nenhuma alteracao no banco do Athos.
CREATE TABLE IF NOT EXISTS "CobrancaAvisoVencimento" (
  "id" SERIAL NOT NULL,
  "cobrancaBoletoId" INTEGER NOT NULL,
  "idclienteAthos" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'enviando',
  "destinatario" TEXT,
  "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "erro" TEXT,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "enviadoEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CobrancaAvisoVencimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CobrancaAvisoVencimento_cobrancaBoletoId_tipo_key" ON "CobrancaAvisoVencimento"("cobrancaBoletoId", "tipo");
CREATE INDEX IF NOT EXISTS "CobrancaAvisoVencimento_idclienteAthos_idx" ON "CobrancaAvisoVencimento"("idclienteAthos");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CobrancaAvisoVencimento_cobrancaBoletoId_fkey') THEN
    ALTER TABLE "CobrancaAvisoVencimento" ADD CONSTRAINT "CobrancaAvisoVencimento_cobrancaBoletoId_fkey"
      FOREIGN KEY ("cobrancaBoletoId") REFERENCES "CobrancaBoleto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
