---
name: Visão Geral do Projeto
description: Arquitetura geral, tecnologias, workspaces e propósito do Sistema de Orçamento BomCusto
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Sistema de Orçamento BomCusto — Visão Geral

**Propósito**: Sistema completo de gestão de orçamentos para a empresa Bom Custo (Ilhabela-SP). Cobre todo o ciclo de vida do orçamento: criação, aprovação, geração de PDF, emissão de NFS-e e cobrança via PIX.

## Monorepo (npm workspaces)

| Workspace | Pacote | Tecnologia |
|-----------|--------|------------|
| `apps/backend` | `@bomcusto/backend` | NestJS 11, Prisma 5, PostgreSQL 16 |
| `apps/frontend` | `@bomcusto/frontend` | Next.js 14 (App Router) |
| `packages/shared` | `@bomcusto/shared` | TypeScript — tipos compartilhados |

## Scripts Raiz
- `dev:backend` — NestJS modo watch (porta 4000)
- `dev:frontend` — Next.js dev server (porta 3000)
- `docker:up/down` — PostgreSQL local (porta 5435)

## Integrações Externas
1. **Athos ERP** — leitura direta no banco PostgreSQL do ERP legado
2. **Chatwoot CRM** — envio de mensagens e sync de contatos (API REST)
3. **EFI Pay** — geração de cobranças PIX e recebimento de webhooks
4. **NFS-e iiBrasil** — emissão de Nota Fiscal de Serviço para o município de Ilhabela via SOAP
5. **PDV** — leitura direta no banco do ponto de venda
6. **MinIO/S3** — armazenamento de PDFs dos orçamentos

## Implantação
- Docker + GitHub Actions (CI/CD via ghcr.io)
- VPS protegida por Tailscale VPN
- Imagens: `ghcr.io/martoxak/bomcusto-backend:latest` e `ghcr.io/martoxak/bomcusto-frontend:latest`
- Nginx como reverse proxy

**Why:** Projeto interno da empresa Bom Custo Ilhabela para digitalizar e automatizar o processo de orçamento de serviços (carimbos, gravações, brindes).
**How to apply:** Contexto de negócio para todas as decisões técnicas. Qualquer nova funcionalidade deve considerar essas integrações.
