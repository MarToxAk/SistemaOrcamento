-- Migration: adicionar ChatwootAutomationConfig (textos editaveis da automacao de
-- fechamento de conversa do Chatwoot, substitui o fluxo n8n)

CREATE TABLE IF NOT EXISTS "ChatwootAutomationConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "promptFechamento" TEXT NOT NULL,
    "mensagemPedidoPendente" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ChatwootAutomationConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ChatwootAutomationConfig" ("id", "promptFechamento", "mensagemPedidoPendente", "updatedAt")
VALUES (
  'default',
  E'Crie UMA mensagem curta e natural para WhatsApp de atendimento de papelaria/grafica.\n\nRegras:\n- Comece com uma variacao de "{{saudacao}}" (ex: "{{saudacao}}!", "{{saudacao}}, tudo bem?", "{{saudacao}}! Como vai?" — varie a forma a cada vez).\n- Transmita esta ideia reescrevendo com suas proprias palavras (NAO repita sempre a mesma frase): perguntar se a pessoa precisa de ajuda com um orcamento, ou se a solicitacao dela ja foi atendida.\n- SEMPRE inclua pelo menos 1 emoji, variando os emojis usados.\n- Maximo 2 frases curtas.\n- Responda APENAS com a mensagem final, sem aspas, sem explicacoes, sem markdown.',
  E'⚠️ ATENCAO: PEDIDO PENDENTE\n\nNao e possivel finalizar este atendimento. Existe um servico vinculado a este cliente que ainda nao esta com status "Finalizado" ou "Entregue".\n\nPor favor, verifique a producao e atualize o status do servico antes de encerrar o contato.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
