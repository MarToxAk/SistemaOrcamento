---
name: Integração Athos ERP
description: Conexão read-only direta no banco PostgreSQL do ERP legado Athos
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Integração Athos ERP

**Localização**: `apps/backend/src/modules/integrations/athos/`
**Tamanho**: athos.service.ts 21K

## O que faz
Leitura direta (read-only) no banco PostgreSQL do ERP legado Athos para:
- Buscar orçamentos pelo número do pedido externo
- Consultar produtos, preços e dados de clientes do ERP
- Verificar saúde da conexão

## Conexão
Conexão direta via `pg` (não usa Prisma) ao banco Athos:
```
ATHOS_PG_HOST, ATHOS_PG_DB, ATHOS_PG_USER, ATHOS_PG_PASS, ATHOS_PG_PORT
```
Variável `ATHOS_API_TOKEN` é opcional (autenticação de API se houver proxy).

## Endpoints Expostos
- `GET /api/quotes/athos-health` — testa se a conexão está ativa
- `GET /api/quotes/athos/:numero` — busca orçamento pelo número no Athos

## Uso no Sistema
- Ao criar um orçamento, pode-se importar dados do Athos pelo número do pedido
- Sincroniza `externalQuoteId` na model Quote com o ID do Athos
- Dados de produtos/preços podem vir do Athos (`PriceSource.PDV`)

**Why:** Athos é o ERP legado da empresa; a integração é somente leitura para evitar inconsistências.
**How to apply:** Nunca escrever no banco Athos. Sempre tratar falhas de conexão graciosamente (sistema deve funcionar mesmo sem Athos disponível).
