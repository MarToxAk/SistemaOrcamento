---
name: Integração Chatwoot CRM
description: Envio de mensagens, sync de contatos e envio de PDF de orçamentos via Chatwoot
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Integração Chatwoot CRM

**Localização**: `apps/backend/src/modules/integrations/chatwoot/`
**Tamanho**: chatwoot.service.ts 4.2K

## O que faz
- Sincroniza contatos do Chatwoot com a model `Customer` do sistema
- Envia mensagens (texto + PDF do orçamento) para o cliente via conversa do Chatwoot
- Associa orçamentos a conversas do Chatwoot (`conversationId`, `chatwootContactId`)

## Variáveis de Ambiente
```
CHATWOOT_BASE_URL    — URL base da instância Chatwoot
CHATWOOT_API_TOKEN   — token de acesso à API
CHATWOOT_ACCOUNT_ID  — ID da conta no Chatwoot
CHATWOOT_INBOX_ID    — ID da caixa de entrada padrão
```

## Fluxo de Uso
1. Orçamento criado com `chatwootContactId` / `conversationId`
2. Ao chamar `POST /api/quotes/:id/enviar`, o sistema:
   - Gera o PDF (MinIO)
   - Envia URL do PDF + mensagem na conversa do Chatwoot
3. Ao emitir NFS-e, envia link do XML/PDF da nota na conversa

## Dados Sincronizados
- `chatwootContactId` — ID do contato no Chatwoot (indexado na model Quote e Customer)
- `conversationId` — ID da conversa associada ao orçamento

**Why:** O atendimento ao cliente é feito pelo Chatwoot; toda comunicação de orçamentos passa por lá.
**How to apply:** Ao adicionar novo tipo de notificação ao cliente, usar chatwoot.service.ts como canal. Verificar se conversationId está preenchido antes de tentar enviar.
