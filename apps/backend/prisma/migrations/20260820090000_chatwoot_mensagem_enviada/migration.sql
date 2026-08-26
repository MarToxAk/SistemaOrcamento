-- Migration: adicionar ChatwootMensagemEnviada (registro de mensagens de automacao
-- enviadas por conversa, substitui a tabela "mensagens_enviadas" do banco externo
-- de pedidos que deixou de ser usado pela automacao de fechamento do Chatwoot)

CREATE TABLE IF NOT EXISTS "ChatwootMensagemEnviada" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "mensagemEnviada" TEXT NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatwootMensagemEnviada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatwootMensagemEnviada_conversationId_tipoEvento_enviadoEm_idx"
    ON "ChatwootMensagemEnviada" ("conversationId", "tipoEvento", "enviadoEm");
