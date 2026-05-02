# Phase 6: Aprovação de Orçamento pelo Cliente com Associação Athos — Contexto

**Coletado:** 2026-05-02
**Status:** Pronto para planejamento
**Fonte:** Discussão com o usuário + análise do codebase

<domain>
## Escopo da Fase

Quando um orçamento é criado/importado com dados do Athos e possui `idcliente`, o sistema
deve **automaticamente** gerar o token de aprovação e enviar mensagem Chatwoot ao cliente
com o link da página de aprovação. Além disso, as páginas do cliente (`/approve`, `/status`)
recebem melhorias para exibir mais informações do orçamento (itens, total).

**O que esta fase entrega:**
1. Disparo automático de mensagem Chatwoot ao criar orçamento com `idcliente` do Athos
2. Correção do link de aprovação (bug: apontava para API em vez da página do cliente)
3. Melhorias nas páginas do cliente: exibir itens do orçamento e total na página de aprovação

**O que NÃO faz:**
- Não escreve no banco Athos (integração é read-only)
- Não cria novo canal de comunicação — usa Chatwoot existente
- Não cria página de listagem de orçamentos por cliente
</domain>

<decisions>
## Decisões de Implementação

### D-01 — Trigger de Associação: Importação do Athos [LOCKED]
O envio automático da mensagem é disparado quando um orçamento é criado com `externalQuoteId`
(dados vindos do Athos) e a consulta ao Athos retorna `idcliente`. Implementar no método
`create` de `quotes.service.ts`: após salvar o orçamento, se `idcliente` estiver disponível
no `athosMapped`, disparar assincronamente com `void this.enviarParaCliente(quote.id).catch(...)`.
**Nota:** O projeto não usa BullMQ/Redis — o padrão correto é fire-and-forget async conforme
`quotes.controller.ts` linha ~97.

### D-02 — Canal: Chatwoot Existente [LOCKED]
A mensagem vai para o Chatwoot usando `chatwootService.sendOutgoingMessage(conversationId, msg)`.
Se o orçamento não tiver `conversationId`, a mensagem não é enviada (logar warning); não
criar nova conversa Chatwoot automaticamente.

### D-03 — Correção do Link de Aprovação [LOCKED — BUG CRÍTICO]
O link de aprovação gerado em `enviarParaCliente` (linha ~1509 de `quotes.service.ts`) aponta
para `/api/quotes/{id}/approve?token=...` (endpoint de API). Deve ser corrigido para
`/orcamento/{id}/approve?token=...` (página Next.js do cliente). Este é o mesmo bug que
afeta o link enviado no Chatwoot hoje.

### D-04 — Melhorias na Página de Aprovação [LOCKED]
A página `/orcamento/[id]/approve?token=...` deve exibir:
- Nome do cliente (`clientName`)
- Número do orçamento (`quoteNumber`)  
- **Total do orçamento** (campo `total` do response do quote)
- **Lista de itens** (nome, quantidade, preço unitário, subtotal) — do array `items` ou `body.itens`
Manter o botão "Aprovar Orçamento" proeminente; os itens ficam acima do botão.

### D-05 — Idempotência do Envio Automático [LOCKED]
Se o orçamento já possui `approvalToken` válido (não expirado), não gerar um novo token.
Reusar o existente. Se já foi enviado mensagem antes (heurística: `approvalRequestedAt` existe),
não reenviar automaticamente — evitar spam ao cliente.

### D-06 — Não Bloquear Criação do Orçamento [LOCKED]
O envio da mensagem é sempre assíncrono (fire-and-forget: `void this.enviarParaCliente(...).catch()`).
Falha no envio não deve retornar erro 500 na criação do orçamento. Logar o erro e continuar.

### Decisões a cargo do Claude
- Estratégia exata de detecção do `idcliente` no fluxo de `create` (usar `athosMapped` do
  Athos lookup já existente, ou adicionar lookup separado)
- Estrutura exata do payload para enqueue no BullMQ
- Quais campos do quote mostrar na página de aprovação e ordem de exibição

</decisions>

<canonical_refs>
## Referências Canônicas

**Agentes downstream DEVEM ler estes arquivos antes de planejar ou implementar.**

### Backend — Quotes
- `apps/backend/src/modules/quotes/quotes.service.ts` — lógica central; `enviarParaCliente` (linha ~1394) contém o padrão de lookup Athos + geração de token + envio Chatwoot
- `apps/backend/prisma/schema.prisma` — modelo `Quote` (campos: `approvalToken`, `approvalExpiresAt`, `approvalRequestedAt`, `approved`, `externalQuoteId`) e modelo `Customer` (`isAssociated`, `chatwootContactId`)

### Backend — Integrações
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — `buscarOrcamentoPorNumero` retorna `mapped.idcliente`; `buscarClientePorId` retorna nome do cliente
- `apps/backend/src/modules/integrations/chatwoot/` — `sendOutgoingMessage(conversationId, message)`

### Frontend — Páginas do Cliente (Phase 5)
- `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` — página de aprovação atual; exibe `quoteNumber` e `clientName`; busca `/api/quotes/{id}` na carga; usa estados `loading-quote | idle | submitting | success | error | no-token`
- `apps/frontend/src/app/orcamento/[id]/status/page.tsx` — página de status atual
- `apps/frontend/src/app/api/quotes/[id]/approve/route.ts` — BFF proxy para aprovação

### Configuração
- `APP_BASE_URL` — variável de ambiente usada para montar o link de aprovação no backend
- `APP_APPROVAL_EXPIRES_HOURS` — TTL do token de aprovação (padrão: 168h = 7 dias)

</canonical_refs>

<specifics>
## Detalhes Específicos

### Bug do link de aprovação (D-03)
Linha 1509 em `quotes.service.ts`:
```typescript
// ATUAL (errado):
approvalLink = `${base.replace(/\/$/, "")}/api/quotes/${quote.id}/approve?token=${approvalToken}`;

// CORRETO:
approvalLink = `${base.replace(/\/$/, "")}/orcamento/${quote.id}/approve?token=${approvalToken}`;
```

### Response do quote na página de aprovação
O endpoint `/api/quotes/{id}` (BFF proxy) retorna o body do backend. Os campos disponíveis:
- `body.idorcamento_interno` → número do orçamento
- `body.cliente.nome` → nome do cliente
- `body.total` ou `total` → total do orçamento
- `body.itens[]` → itens com `{ descricao, quantidade, valorUnitario, subtotal }`

### Fluxo de importação do Athos
1. `POST /api/quotes` com payload incluindo `idorcamento` (número do Athos)
2. `quotes.service.ts` → `create()` → chama `buscarOrcamentoPorNumero`
3. `athosMapped.idcliente` disponível após a busca
4. Se `idcliente` presente → enfileirar job `enviar-cliente` no BullMQ com `quoteId`
</specifics>

<deferred>
## Ideias Adiadas

- Página de listagem de todos os orçamentos de um `idcliente` (não solicitada nesta fase)
- Criar conversa Chatwoot automaticamente se não houver `conversationId`
- Reenvio manual do link de aprovação pelo painel interno
</deferred>

---

*Phase: 06-aprovacao-cliente-athos*
*Context coletado: 2026-05-02 via discussão com usuário*
