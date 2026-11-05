-- Fase 42 (D-06): lista fixa de e-mails em copia (CC) por cliente do Athos, no banco do Sistema (nunca no Athos).
-- Idempotente (regra da Fase 09): re-executar nao falha.
CREATE TABLE IF NOT EXISTS "CobrancaEmailCcPadrao" (
    "idclienteAthos" INTEGER NOT NULL,
    "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CobrancaEmailCcPadrao_pkey" PRIMARY KEY ("idclienteAthos")
);
