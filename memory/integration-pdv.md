---
name: Integração PDV (Ponto de Venda)
description: Leitura read-only do banco do PDV para importação de dados de venda
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Integração PDV (Ponto de Venda)

**Localização**: `apps/backend/src/modules/integrations/pdv/`
**Tamanho**: pdv.service.ts 898 bytes (módulo simples)

## O que faz
Conexão direta read-only ao banco PostgreSQL do PDV (ponto de venda) da empresa para:
- Importar dados de vendas já realizadas
- Sincronizar itens de orçamento com preços do PDV (`PriceSource.PDV`)

## Variáveis de Ambiente
```
PDV_DB_URL                 — connection string do banco do PDV
PDV_DB_SCHEMA              — schema PostgreSQL a usar
PDV_DB_READONLY_USER       — usuário read-only
PDV_DB_READONLY_PASSWORD   — senha do usuário read-only
```

## Uso no Sistema
- Model `QuoteItem` tem campo `priceSource: PriceSource (MANUAL | PDV)` — indica se o preço veio do PDV
- `DataSource.PDV` na model `Quote` indica que o orçamento foi originado do PDV
- Módulo pequeno, possivelmente em expansão futura

**Why:** PDV é um sistema separado (possivelmente legado); read-only evita qualquer escrita acidental.
**How to apply:** Credenciais devem ser de um usuário PostgreSQL com permissão somente SELECT.
