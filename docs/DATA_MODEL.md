# Modelo de Dados (V1)

## Entidades principais

1. Customer
- id (uuid)
- fullName
- phone
- email
- source (MANUAL/PDV/CHATWOOT)
- chatwootContactId
- createdAt / updatedAt

2. User
- id (uuid)
- name
- email
- role (VENDEDOR/ATENDENTE/ADMIN)
- isActive
- createdAt / updatedAt

3. Quote
- id (uuid)
- internalNumber (autoincrement, unico)
- externalQuoteId (ID legado/PDV quando existir)
- customerId
- createdById
- status (PENDENTE/APROVADO/EM_PRODUCAO/PRONTO_PARA_ENTREGA/ENTREGUE/CANCELADO)
- source (MANUAL/PDV/CHATWOOT)
- sellerExternalId / sellerName
- conversationId / chatwootContactId
- validity / deliveryDate / paymentTerms
- notes / budgetDate / editedAt
- subtotal / discount / surcharge / total
- createdAt / updatedAt

4. QuoteItem
- id (uuid)
- quoteId
- parentItemId (para itens filhos)
- sequence
- externalItemId
- productExternalId
- reference
- shortDescription
- description
- quantity / unitPrice / discount / finalPrice
- priceSource (MANUAL/PDV)

5. QuoteStampItem
- id (uuid)
- quoteId
- number
- stampType
- dimensions
- description

6. QuoteStatusHistory
- id (uuid)
- quoteId
- oldStatus
- newStatus
- changedById
- changedByName
- changedAt

7. QuoteDocument
- id (uuid)
- quoteId
- fileName
- contentType
- storagePath
- generatedBy
- generatedAt

8. ExternalReference
- id (uuid)
- entityType (customer/quote/item)
- entityId
- externalSystem (PDV/CHATWOOT)
- externalId

## Indices e constraints recomendados

- Customer(phone)
- Customer(email)
- Quote(internalNumber) [unico]
- Quote(status, updatedAt)
- Quote(externalQuoteId)
- Quote(conversationId)
- Quote(chatwootContactId)
- QuoteItem(quoteId, sequence)
- QuoteItem(parentItemId)
- QuoteStampItem(quoteId, number)
- QuoteDocument(quoteId, generatedAt)
- ExternalReference(externalSystem, externalId)
- ExternalReference(externalSystem, externalId, entityType) [unico]

## Regra de integracao PDV

- O banco Athos e somente consulta na V1.
- Nenhuma operacao de escrita deve ser feita no PDV.
- O sistema novo persiste seus proprios status e historico no banco principal.
