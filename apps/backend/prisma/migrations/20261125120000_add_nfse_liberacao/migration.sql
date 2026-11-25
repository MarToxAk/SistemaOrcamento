-- Fase 54 (D-09): auditoria da liberacao da NFS-e por senha.
-- Migracao ADITIVA e IDEMPOTENTE: so cria a tabela NfseLiberacao e seus indices. Nenhuma tabela
-- existente e alterada ou apagada, e nada toca o Athos. Sem chave estrangeira para Quote de
-- proposito: a fusao de orcamentos apaga linhas de Quote e a trilha de auditoria deve sobreviver.
-- A tabela nunca guarda a senha nem hash dela.

-- CreateTable
CREATE TABLE IF NOT EXISTS "NfseLiberacao" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "quoteNumero" TEXT,
    "resultado" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "valorPago" DECIMAL(12,2) NOT NULL,
    "valorDevido" DECIMAL(12,2) NOT NULL,
    "valorNota" DECIMAL(12,2),
    "liberadoPor" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "nfseNumero" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NfseLiberacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NfseLiberacao_quoteId_criadoEm_idx" ON "NfseLiberacao"("quoteId", "criadoEm");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NfseLiberacao_criadoEm_idx" ON "NfseLiberacao"("criadoEm");
