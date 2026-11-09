-- Fase 44 (ORC-09): idempotencia e auditoria dos orcamentos criados pela IA no Athos. Aditiva e idempotente (regra da Fase 09). Banco do Sistema apenas; nenhuma alteracao no Athos.
CREATE TABLE IF NOT EXISTS "AthosOrcamentoIa" (
  "id" SERIAL NOT NULL,
  "idempotencyKey" TEXT,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processando',
  "idorcamento" INTEGER,
  "senhabalcao" INTEGER,
  "valorBruto" DECIMAL(12,2),
  "valorLiquido" DECIMAL(12,2),
  "request" JSONB,
  "resposta" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AthosOrcamentoIa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AthosOrcamentoIa_idempotencyKey_key" ON "AthosOrcamentoIa"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "AthosOrcamentoIa_idorcamento_idx" ON "AthosOrcamentoIa"("idorcamento");
