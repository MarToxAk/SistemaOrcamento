---
name: Frontend — Arquitetura Next.js
description: Páginas, rotas de API, componentes e configuração do frontend Next.js 14
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Frontend — Arquitetura Next.js 14

**Localização**: `apps/frontend/src/`
**Framework**: Next.js 14.2.35 com App Router
**Porta**: 3000 (dev e produção)

## Páginas (`app/`)

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `page.tsx` | Home / landing |
| `/orcamento` | `orcamento/page.tsx` | Lista / dashboard de orçamentos |
| `/orcamento/novo` | `orcamento/novo/page.tsx` | Formulário de criação de orçamento |
| `/orcamento/[id]` | `orcamento/[id]/page.tsx` | Detalhe do orçamento |
| `/orcamento/andamento` | `orcamento/andamento/page.tsx` | Acompanhamento / progresso |
| `/status` | `status/page.tsx` | Rastreamento de status para o cliente |

**Arquivo especial**: `orcamento/novo/carimbos-config.ts` — configurações de tipos de carimbos/gravações

## Rotas de API Next.js (`app/api/`)

Estas rotas funcionam como proxy para o backend NestJS:

| Rota | Método | Destino |
|------|--------|---------|
| `/api/quotes` | POST | Cria orçamento |
| `/api/quotes/[id]` | GET | Detalhe |
| `/api/quotes/[id]` | PATCH | Atualiza |
| `/api/quotes/[id]/pdf` | POST | Gera/busca PDF |
| `/api/quotes/[id]/enviar` | POST | Envia ao cliente |
| `/api/quotes/[id]/nfse` | POST | Emite/busca NFS-e |
| `/api/quotes/[id]/status` | GET | Status atual |
| `/api/quotes/athos/[numero]` | GET | Busca no Athos |
| `/api/efi/status` | GET | Status gateway EFI |

## Configuração
- `BACKEND_URL` — URL do backend NestJS (usado como proxy interno)
- `next.config.mjs` — configurações do Next.js

## Dockerfile Frontend
- Base: `node:20-bookworm-slim`
- Multi-stage: deps → build → runtime
- Produção: porta 3001 mapeada para 3000

**Why:** O frontend usa rotas de API Next.js como proxy para evitar expor o backend diretamente ao browser e para centralizar headers de autenticação.
**How to apply:** Toda chamada do browser vai para `/api/*` do Next.js, que repassa para o backend em `BACKEND_URL`. Nunca chamar o backend diretamente do client-side.
