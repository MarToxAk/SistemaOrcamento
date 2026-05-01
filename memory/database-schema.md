---
name: Schema do Banco de Dados (Prisma)
description: Modelos, enums, relacionamentos e índices do banco PostgreSQL via Prisma
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Schema do Banco de Dados

**Arquivo**: `apps/backend/prisma/schema.prisma`
**Banco**: PostgreSQL 16
**ORM**: Prisma 5.19.1

## Enums

| Enum | Valores |
|------|---------|
| `DataSource` | MANUAL, PDV, CHATWOOT |
| `PriceSource` | MANUAL, PDV |
| `QuoteStatus` | PENDENTE, PAGAMENTO_PARCIAL, APROVADO, EM_PRODUCAO, PRONTO_PARA_ENTREGA, ENTREGUE, ENVIADO, CANCELADO |
| `UserRole` | VENDEDOR, ATENDENTE, ADMIN |
| `ExternalSystem` | PDV, CHATWOOT |

## Modelos Principais

### `Customer`
- `id` (UUID), `fullName`, `phone`, `email`
- `source` (DataSource), `chatwootContactId`
- Índices: `phone`, `email`

### `User`
- `id`, `name`, `email` (unique), `role` (UserRole), `isActive`

### `Quote` (entidade central — 40+ campos)
Campos principais:
- `id` (UUID), `internalNumber` (auto-increment)
- `externalQuoteId` (BigInt, unique) — ID no Athos/PDV
- `customerId`, `createdById`
- `status` (QuoteStatus), `source` (DataSource)
- Chatwoot: `chatwootContactId`, `conversationId`
- Pagamento: `paymentSource`, `method`, `externalId`, `amount`, `discount`, `paidTotal`, `pendingTotal`, `installments`
- Financeiro: `subtotal`, `discount`, `surcharge`, `total`
- Datas: `deliveryDate`, `budgetDate`, `editedAt`, `paymentConfirmedAt`, `paymentFailedAt`
- Aprovação: `approvalToken`, `approvalRequestedAt`, `approvalExpiresAt`, `approved`, `approvedAt`
- NFS-e: `nfseNumero`, `nfseCodigoVerificacao`, `nfseLink`, `nfseEmitidaEm`

### `QuoteItem` (itens de linha)
- `sequence`, `externalItemId`, `productExternalId`
- `reference`, `shortDescription`, `description`
- `quantity`, `unitPrice`, `discount`, `finalPrice`
- `priceSource` (PriceSource)
- Auto-referenciado: `parentItemId` (subitens)

### `QuoteStampItem` (carimbos/gravações)
- `number`, `stampType`, `dimensions`, `description`
- Associado ao orçamento

### `QuoteStatusHistory` (auditoria de status)
- `oldStatus`, `newStatus`, `changedById`, `changedByName`, `changedAt`

### `QuoteDocument` (PDFs armazenados)
- `fileName`, `contentType`, `storagePath`, `publicUrl`
- `generatedBy`, `generatedAt`

### `PaymentTransaction` (log de pagamentos)
- `externalId` (unique), `eventId`, `source`, `method`, `status`
- `amount`, `metadata`, `webhookPayload`, `processedAt`

### `ExternalReference` (IDs de sistemas externos)
- `entityType`, `entityId`, `externalSystem`, `externalId`
- Unique: `(externalSystem, externalId, entityType)`

## Migrations (ordem cronológica)
1. `20260407_init` — schema inicial
2. `20260409_add_externalQuoteId_unique`
3. `20260410_add_payment_fields`
4. `20260428_add_approval_fields`
5. `20260428_add_nfse_to_quote`
6. `20260428_add_nfse_link`

**How to apply:** Ao adicionar campo novo na Quote, criar migration com `prisma migrate dev`. Campos de integração externa devem ser nullable para não quebrar orçamentos manuais.
