-- Migration: adicionar OrcamentoItemCorrecao (correcao manual de item de orcamento do Athos/PDV)

CREATE TABLE IF NOT EXISTS "OrcamentoItemCorrecao" (
    "id" TEXT NOT NULL,
    "idOrcamento" TEXT NOT NULL,
    "idItemOrcamento" TEXT NOT NULL,
    "valorItem" DECIMAL(12,2) NOT NULL,
    "valorDesconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorFinalItem" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrcamentoItemCorrecao_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrcamentoItemCorrecao_idOrcamento_idItemOrcamento_key') THEN
    ALTER TABLE "OrcamentoItemCorrecao"
      ADD CONSTRAINT "OrcamentoItemCorrecao_idOrcamento_idItemOrcamento_key" UNIQUE ("idOrcamento", "idItemOrcamento");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OrcamentoItemCorrecao_idOrcamento_idx" ON "OrcamentoItemCorrecao"("idOrcamento");
