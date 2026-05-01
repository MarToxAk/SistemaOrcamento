---
name: Backend — Arquitetura NestJS
description: Estrutura de módulos, entry point, configuração global e convenções do backend NestJS
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Backend — Arquitetura NestJS

**Localização**: `apps/backend/src/`
**Entry point**: `apps/backend/src/main.ts`
- Porta padrão: 4000 (env `PORT`)
- Prefixo global: `/api`
- CORS habilitado
- ValidationPipe global: `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`

## Módulos Registrados em `app.module.ts`

| Módulo | Responsabilidade |
|--------|-----------------|
| `ConfigModule` | Variáveis de ambiente (global) |
| `DatabaseModule` | Prisma client provider |
| `QuotesModule` | Core de orçamentos (principal) |
| `ChatwootModule` | Integração CRM |
| `EfiModule` | Gateway de pagamentos PIX |
| `NfseModule` | Emissão NFS-e SOAP |
| `PdvModule` | Leitura PDV read-only |

## Estrutura de Diretórios

```
src/
└── modules/
    ├── app.module.ts
    ├── health.controller.ts
    ├── database/
    │   ├── database.module.ts
    │   └── prisma.service.ts
    ├── quotes/
    │   ├── quotes.module.ts
    │   ├── quotes.controller.ts
    │   ├── quotes.service.ts             (69K — core business logic)
    │   ├── quotes-pdf-storage.service.ts (21K — PDF via Puppeteer + MinIO)
    │   └── dto/
    └── integrations/
        ├── athos/
        ├── chatwoot/
        ├── efi/
        ├── nfse/
        └── pdv/
```

## Ferramentas principais
- **ORM**: Prisma 5.19.1
- **PDF**: Puppeteer 24.40.0 + Handlebars 4.7.9 (templates HTML)
- **HTTP**: Axios 1.7.7
- **SOAP**: soap 1.9.1 (para NFS-e)
- **Storage**: MinIO 8.0.7

## Dockerfile Backend
- Base: `node:20-bookworm-slim`
- Inclui Chromium instalado (necessário para Puppeteer gerar PDF)
- Multi-stage: deps → build → runtime
- CMD: executa `prisma migrate deploy` + `node dist/main`

**Why:** NestJS modular permite isolar cada integração. O módulo de quotes tem dependências por ForwardRef para Athos, Chatwoot e EFI.
**How to apply:** Ao adicionar funcionalidade nova, identificar em qual módulo se encaixa. Nunca colocar lógica de integração externa diretamente em quotes.service.ts.
