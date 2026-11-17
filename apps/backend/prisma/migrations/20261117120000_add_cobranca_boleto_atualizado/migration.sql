-- Fase 50 (D-07, D-08, D-11, D-12, D-14): boleto atualizado com juros e multa.
-- Aditiva e idempotente (regra da Fase 09). Banco do Sistema apenas; nenhuma alteracao no banco do Athos.
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "boletoOrigemId" INTEGER;
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "valorPrincipal" DECIMAL(12,2);
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "valorJuros" DECIMAL(12,2);
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "valorMulta" DECIMAL(12,2);
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "taxaJurosMesAplicada" DECIMAL(7,4);
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "multaPercentualAplicada" DECIMAL(7,4);
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "taxaJurosMesPosVencimento" DECIMAL(7,4);
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "multaPercentualPosVencimento" DECIMAL(7,4);
ALTER TABLE "CobrancaBoleto" ADD COLUMN IF NOT EXISTS "mensagemAtualizacao" TEXT;
CREATE INDEX IF NOT EXISTS "CobrancaBoleto_boletoOrigemId_idx" ON "CobrancaBoleto"("boletoOrigemId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CobrancaBoleto_boletoOrigemId_fkey') THEN
    ALTER TABLE "CobrancaBoleto" ADD CONSTRAINT "CobrancaBoleto_boletoOrigemId_fkey"
      FOREIGN KEY ("boletoOrigemId") REFERENCES "CobrancaBoleto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "CobrancaBoletoTitulo" ADD COLUMN IF NOT EXISTS "juros" DECIMAL(12,2);
ALTER TABLE "CobrancaBoletoTitulo" ADD COLUMN IF NOT EXISTS "multa" DECIMAL(12,2);
ALTER TABLE "CobrancaBoletoTitulo" ADD COLUMN IF NOT EXISTS "diasAtraso" INTEGER;
ALTER TABLE "CobrancaBoletoTitulo" ADD COLUMN IF NOT EXISTS "vencimentoOriginal" TEXT;
CREATE TABLE IF NOT EXISTS "CobrancaEncargosConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "taxaJurosMes" DECIMAL(7,4) NOT NULL DEFAULT 0.99,
  "multaPercentual" DECIMAL(7,4) NOT NULL DEFAULT 2,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CobrancaEncargosConfig_pkey" PRIMARY KEY ("id")
);
