# STRUCTURE.md
_Last updated: 2026-05-15 | Focus: arch_

## Summary

The project is a TypeScript monorepo with a NestJS backend, a Next.js 15 frontend, and a shared types package. Feature code lives under `apps/backend/src/modules/` (domain-per-folder) and `apps/frontend/src/app/` (Next.js App Router). Configuration and planning artifacts are co-located at the repo root.

---

## Top-Level Directory Layout

```
/
├── apps/
│   ├── backend/          NestJS API server (port 3001)
│   └── frontend/         Next.js 15 app (port 3000)
├── packages/
│   └── shared/           Shared TypeScript types (QuoteRow, etc.)
├── deploy/               Docker Compose + deployment scripts
├── docs/                 Manual documentation and diagrams
├── scripts/              One-off utility/reconciliation scripts (Node/Python)
├── memory/               Claude Code persistent memory files
├── .planning/            GSD planning artifacts (phases, roadmap, state)
└── .claude/              Claude Code agent settings and hooks
```

---

## Backend Module Structure (`apps/backend/src/modules/`)

| Folder | Responsibility |
|--------|---------------|
| `quotes/` | Core business domain — quote CRUD, PDF generation, email dispatch, status transitions, Athos sync, EFI payment linking |
| `integrations/athos/` | Athos Empresarial ERP proxy — schema discovery, data reads, caixa writes |
| `integrations/efi/` | EFI Bank integration — charge creation, PIX/boleto, webhook processing |
| `integrations/nfse/` | NFS-e (nota fiscal) — SOAP client, RPS building, discount logic |
| `integrations/chatwoot/` | Chatwoot messaging — notification dispatch for status changes |
| `integrations/pdv/` | PDV (point-of-sale) stub — non-functional, not yet implemented |
| `common/` | Shared guards, interceptors, pipes, decorators |
| `database/` | Prisma module setup, DatabaseService |
| `events/` | Server-Sent Events (SSE) gateway for real-time status updates |
| `security/` | Auth middleware, JWT validation, IP allowlisting |

---

## Frontend Route Structure (`apps/frontend/src/app/`)

| Route | Purpose |
|-------|---------|
| `/orcamento` | Quote list (internal dashboard) |
| `/orcamento/novo` | New quote creation form |
| `/orcamento/[id]` | Quote detail / editor |
| `/orcamento/andamento` | Production kanban / status board |
| `/status` | Public customer-facing status page (real-time SSE) |
| `/api/quotes/` | Next.js API route proxies to backend |
| `/api/athos/` | Athos proxy API routes |
| `/api/efi/` | EFI proxy API routes |
| `/api/events/` | SSE event stream endpoint |

---

## Entry Points

| File | Role |
|------|------|
| `apps/backend/src/main.ts` | NestJS bootstrap — HTTP server, CORS, global pipes |
| `apps/backend/src/app.module.ts` | Root NestJS module, imports all feature modules |
| `apps/frontend/src/app/layout.tsx` | Next.js root layout |
| `packages/shared/src/index.ts` | Shared types barrel export |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `apps/backend/.env` | Backend secrets (DATABASE_URL, EFI_*, ATHOS_*, CHATWOOT_*) |
| `apps/frontend/.env.local` | Frontend env (NEXT_PUBLIC_API_URL) |
| `apps/backend/prisma/schema.prisma` | Database schema |
| `apps/backend/jest.config.js` | Jest test runner config |
| `apps/backend/tsconfig.json` | TypeScript config (backend) |
| `apps/frontend/next.config.ts` | Next.js config |
| `deploy/docker-compose.yml` | Production container setup |

---

## Feature Placement Guide

| What you're adding | Where it goes |
|--------------------|---------------|
| New domain feature | `apps/backend/src/modules/<domain>/` — create `<domain>.module.ts`, `<domain>.service.ts`, `<domain>.controller.ts` |
| New external integration | `apps/backend/src/modules/integrations/<name>/` |
| New DTO | `apps/backend/src/modules/<domain>/dto/<action>-<domain>.dto.ts` |
| New Prisma model | `apps/backend/prisma/schema.prisma` + run `prisma migrate dev` |
| New frontend page | `apps/frontend/src/app/<route>/page.tsx` |
| New frontend API proxy | `apps/frontend/src/app/api/<domain>/route.ts` |
| Shared type | `packages/shared/src/` then re-export from `index.ts` |
| Utility script | `scripts/` (Node .mjs or Python .py) |
