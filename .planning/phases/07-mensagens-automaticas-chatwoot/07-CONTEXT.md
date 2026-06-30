# Phase 7: Mensagens Automáticas ao Cliente via Chatwoot — Contexto

**Coletado:** 2026-05-03
**Status:** Pronto para planejamento
**Fonte:** Discussão com o usuário

<domain>
## Escopo da Fase

Enviar notificação automática ao cliente via Chatwoot em cada evento relevante do serviço:
- Aprovação do orçamento pelo cliente (já existe, precisa de fix de encoding + padronização)
- Pagamento PIX parcial, total e parcelado (já existe em efi.service.ts, precisa de padronização de tom)
- Mudança de status para EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE e CANCELADO (novo — changeStatus() não notifica hoje)

**O que NÃO faz:**
- Não cria conversa Chatwoot automaticamente (se não houver conversationId, loga e segue)
- Não permite configurar templates pelo painel (templates fixos no código)
- Não envia para status intermediários internos (PENDENTE, ENVIADO)
</domain>

<decisions>
## Decisões de Implementação

### D-01 — Tom das mensagens [LOCKED]
Tom **profissional mas amigável**: nome completo do cliente, emojis apenas em pontos-chave,
linguagem neutra e respeitosa. Não usar gírias ou linguagem muito informal.

Padrão: `Olá, {Nome Completo}. {Conteúdo principal}. {Emoji de fechamento ou próximo passo}.`

### D-02 — Conteúdo das mensagens de status [LOCKED]
Mensagens de mudança de status devem ser **enxutas**: apenas número do orçamento + descrição
do status + próximo passo imediato. Sem valor total, sem lista de itens.

### D-03 — Textos exatos das mensagens de status [LOCKED]
Implementar exatamente estes textos em `changeStatus()`:

**EM_PRODUCAO:**
```
🎨 Olá, {Nome Completo}. Seu pedido #{número} entrou em produção. Avisaremos assim que estiver pronto.
```

**PRONTO_PARA_ENTREGA:**
```
✅ Olá, {Nome Completo}. Seu pedido #{número} está pronto para retirada. Pode passar na loja quando quiser.
```

**ENTREGUE:**
```
🎉 Olá, {Nome Completo}. Seu pedido #{número} foi entregue. Obrigado pela preferência! Qualquer dúvida, estamos à disposição.
```

**CANCELADO:**
```
ℹ️ Olá, {Nome Completo}. O orçamento #{número} foi cancelado. Se tiver dúvidas ou quiser refazer o pedido, é só falar com a gente.
```

### D-04 — Mensagem de aprovação [LOCKED]
Manter o **conteúdo atual** da mensagem em `approveByToken()` — apenas corrigir o bug de
codificação de caracteres (emojis aparecem como `ðŸ'‹` em vez de `👋` por problema de
encoding UTF-8 na edição do arquivo).

### D-05 — Mensagens de PIX [LOCKED]
As mensagens de pagamento PIX em `efi.service.ts` **já existem e funcionam**. Revisar e
ajustar o tom para seguir D-01 (profissional mas amigável) sem alterar a lógica ou estrutura.
Não reescrever do zero — apenas padronizar onde necessário.

### D-06 — Status que notificam vs. que não notificam [LOCKED]
Notificar apenas: EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, CANCELADO.
Não notificar: PENDENTE, ENVIADO, APROVADO (aprovação já tem sua própria mensagem via approveByToken),
PAGAMENTO_PARCIAL (coberto pelas mensagens PIX do efi.service.ts).

### D-07 — Ausência de conversationId [LOCKED]
Se o orçamento não tiver `conversationId`, logar aviso (`logger.warn`) e não lançar exceção.
Mesmo comportamento já usado em approveByToken() e enviarParaCliente().

### Decisões a cargo do Claude
- Onde exatamente injetar a lógica de notificação no `changeStatus()` (antes ou depois do commit no banco)
- Como resolver o nome do cliente quando não estiver cached no quote (reusar padrão do approveByToken)
- Estratégia de teste unitário para as novas mensagens

</decisions>

<canonical_refs>
## Referências Canônicas

**Agentes downstream DEVEM ler estes arquivos antes de planejar ou implementar.**

### Backend — Mensagens existentes (ler antes de qualquer alteração)
- `apps/backend/src/modules/quotes/quotes.service.ts` — `approveByToken()` (~linha 1620): lógica atual de notificação pós-aprovação com bug de encoding
- `apps/backend/src/modules/quotes/quotes.service.ts` — `changeStatus()` (~linha 630): onde adicionar notificações de status
- `apps/backend/src/modules/integrations/efi/efi.service.ts` — webhook PIX (~linha 600): mensagens de pagamento existentes

### Backend — Integração Chatwoot
- `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` — `sendOutgoingMessage(conversationId, message)`: método de envio

### Enum de Status
- Status válidos (de `quotes.service.ts` linha 14-22): PENDENTE, ENVIADO, PAGAMENTO_PARCIAL, APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, CANCELADO
- Label legível (linha 44-50): `statusLabels` map para display

</canonical_refs>

<specifics>
## Detalhes Específicos

### Bug de encoding no approveByToken()
O arquivo `quotes.service.ts` foi editado com encoding incorreto. Emojis como `👋` aparecem
como `ðŸ'‹` e "Olá" aparece como "OlÃ¡". Corrigir salvando o arquivo em UTF-8 sem BOM.

### Padrão de notificação a replicar
O `approveByToken()` já implementa o padrão correto:
```typescript
try {
  const convId = quote.conversationId ? String(quote.conversationId) : undefined;
  if (convId) {
    // ... resolve nome do cliente ...
    await this.chatwootService.sendOutgoingMessage(convId, mensagem);
  }
} catch (err) {
  this.logger.warn(`Falha ao notificar via Chatwoot: ${err instanceof Error ? err.message : String(err)}`);
}
```
Replicar este padrão try/catch em `changeStatus()`.

### Resolução do nome do cliente em changeStatus()
O `changeStatus()` recebe o `quote` do banco. Para obter o nome do cliente:
1. Tentar `quote.customer?.fullName` (Prisma include se disponível)
2. Fallback: usar "Cliente" (não fazer lookup Athos em changeStatus — operação síncrona crítica)
</specifics>

<deferred>
## Ideias Adiadas

- Templates de mensagem configuráveis pelo painel interno (próximo milestone)
- Histórico de mensagens enviadas ao cliente
- Mensagem de lembrete automático para orçamentos PENDENTE há X dias
</deferred>

---

*Phase: 07-mensagens-automaticas-chatwoot*
*Context coletado: 2026-05-03 via discussão com usuário*
