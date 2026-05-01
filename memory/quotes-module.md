---
name: Módulo de Orçamentos (Quotes)
description: Endpoints, lógica de negócio, geração de PDF e fluxo de aprovação do módulo principal
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Módulo de Orçamentos (Quotes)

**Localização**: `apps/backend/src/modules/quotes/`

## Endpoints REST (`/api/quotes`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/quotes` | Lista orçamentos (filtros: status, take, skip, conversationId, chatwootContactId) |
| GET | `/api/quotes/:id` | Detalhe de um orçamento |
| GET | `/api/quotes/:id/payment-status` | Checa status de pagamento |
| GET | `/api/quotes/athos-health` | Testa conexão com Athos |
| GET | `/api/quotes/athos/:numero` | Busca orçamento no Athos |
| GET | `/api/quotes/duplicates` | Lista orçamentos duplicados |
| POST | `/api/quotes` | Cria novo orçamento |
| POST | `/api/quotes/duplicates/merge` | Mescla duplicatas |
| POST | `/api/quotes/:id/pdf` | Gera PDF do orçamento |
| POST | `/api/quotes/:id/pdf/send` | Reenvia PDF ao Chatwoot |
| POST | `/api/quotes/:id/enviar` | Envia orçamento ao cliente |
| POST | `/api/quotes/:id/approve` | Aprova via token |
| PATCH | `/api/quotes/:id/status` | Atualiza status |

## DTOs
- `create-quote.dto.ts` (4.1K) — campos completos de criação
- `update-status.dto.ts` — mudança de status
- `merge-duplicates.dto.ts` — merge de duplicatas

## Serviços

### `quotes.service.ts` (69K)
Lógica central de negócio:
- CRUD de orçamentos
- Integração com Athos (busca produtos/preços)
- Aprovação via token (`approvalToken`, `approvalExpiresAt`)
- Rastreamento de pagamento (parcial, total, PIX)
- Emissão de NFS-e após aprovação/pagamento
- Histórico de status (`QuoteStatusHistory`)

### `quotes-pdf-storage.service.ts` (21K)
- Geração de PDF com Puppeteer (Chromium headless)
- Templates Handlebars para renderização HTML
- Upload para MinIO (S3-compatible)
- URL pública para compartilhar PDF pelo Chatwoot

## Fluxo de Status (QuoteStatus)
```
PENDENTE → ENVIADO → APROVADO → EM_PRODUCAO → PRONTO_PARA_ENTREGA → ENTREGUE
                              ↘ CANCELADO
                   PAGAMENTO_PARCIAL (estado intermediário)
```

## Fluxo de Aprovação
1. Cliente recebe link com `approvalToken`
2. `POST /api/quotes/:id/approve` valida token e `approvalExpiresAt`
3. Status muda para APROVADO, registra `approvedAt`
4. Trigger automático: emissão NFS-e (se configurado)

**Why:** O módulo de quotes é o coração do sistema, orquestrando todas as outras integrações.
**How to apply:** Ao modificar quotes.service.ts, verificar impacto no fluxo de status e na geração automática de NFS-e.
