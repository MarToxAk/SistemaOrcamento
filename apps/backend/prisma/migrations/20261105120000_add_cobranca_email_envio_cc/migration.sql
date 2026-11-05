-- Fase 42 (D-05): destinatarios em copia (CC) registrados no historico do envio de e-mail de cobranca.
-- Aditiva e idempotente (regra da Fase 09): re-executar nao falha.
ALTER TABLE "CobrancaEmailEnvio" ADD COLUMN IF NOT EXISTS "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
