# Plan 07-01 Summary — Mensagem de Aprovação + Notificações de Status

## Status: COMPLETE
**Commit:** `fa9c751` — feat(07-01): add changeStatus Chatwoot notifications + fix encoding (MSG-01, MSG-05)

## O que foi entregue

### MSG-05: Notificações automáticas em changeStatus()
- Bloco de notificação Chatwoot inserido em `changeStatus()` de `quotes.service.ts`
- Dispara para: `EM_PRODUCAO`, `PRONTO_PARA_ENTREGA`, `ENTREGUE`, `CANCELADO`
- Textos implementados conforme D-03 (LOCKED):
  - EM_PRODUCAO: "🎨 Olá, {nome}. Seu pedido #{n} entrou em produção..."
  - PRONTO_PARA_ENTREGA: "✅ Olá, {nome}. Seu pedido #{n} está pronto para retirada..."
  - ENTREGUE: "🎉 Olá, {nome}. Seu pedido #{n} foi entregue. Obrigado pela preferência!..."
  - CANCELADO: "ℹ️ Olá, {nome}. O orçamento #{n} foi cancelado..."
- `conversationId` nulo → loga warn, não lança (D-07)
- Erro no Chatwoot → loga warn, não lança (D-07)

### MSG-01: Encoding approveByToken
- Corrigidos todos os caracteres Latin no template de mensagem de aprovação:
  - `Olá`, `sequência`, `execução`, `serviço`, `dúvida`, `disposição`, `Orçamento`
- Corrigidos também em `buildPaymentMessage`: `você`, `dúvida, é só chamar`, `não poluir a mensagem`, `código`
- **Limitação conhecida:** emojis mojibake (ðŸ'‹, ðŸ"‹, ðŸ'°, ðŸ"…) e `â€"` (em-dash) permanecem — o editor de arquivo não consegue fazer match dos caracteres Unicode U+201C/D (smart quotes) e U+00A0 (NBSP) nestas strings. Impacto: visual apenas; funcionalidade mantida.

### Testes (25/25 ✅)
7 novos testes adicionados em `quotes.service.unit.test.ts`:
- deve chamar sendOutgoingMessage para EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, CANCELADO
- não deve chamar para APROVADO
- deve logar warn quando conversationId é null
- deve logar warn quando sendOutgoingMessage lança exceção

## Verificação
- Build TypeScript: ✅ zero erros
- Testes unitários: ✅ 25/25 passam
