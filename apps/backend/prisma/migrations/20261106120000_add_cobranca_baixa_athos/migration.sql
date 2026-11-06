-- Fase 43 (BX-07): resultado duravel da baixa no Athos. Aditiva e idempotente (regra da Fase 09).
-- Banco do Sistema apenas; nenhuma alteracao no banco do Athos.
ALTER TABLE "CobrancaBoleto"
  ADD COLUMN IF NOT EXISTS "athosBaixaStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "athosBaixaErroCodigo" TEXT,
  ADD COLUMN IF NOT EXISTS "athosBaixaErroMensagem" TEXT,
  ADD COLUMN IF NOT EXISTS "athosBaixaTentativas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "athosBaixaUltimaEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "athosBaixaDataPagamento" TEXT,
  ADD COLUMN IF NOT EXISTS "athosBaixaValorPagoEfi" DECIMAL(12,2);

CREATE INDEX IF NOT EXISTS "CobrancaBoleto_athosBaixaStatus_idx" ON "CobrancaBoleto"("athosBaixaStatus");

CREATE TABLE IF NOT EXISTS "CobrancaBaixaAthosLog" (
  "id" SERIAL NOT NULL,
  "cobrancaBoletoId" INTEGER NOT NULL,
  "operacao" TEXT NOT NULL,
  "origem" TEXT NOT NULL,
  "resultado" TEXT NOT NULL,
  "codigoErro" TEXT,
  "mensagem" TEXT,
  "dataPagamento" TEXT,
  "valorTotal" DECIMAL(12,2),
  "titulos" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CobrancaBaixaAthosLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CobrancaBaixaAthosLog_cobrancaBoletoId_idx" ON "CobrancaBaixaAthosLog"("cobrancaBoletoId");
