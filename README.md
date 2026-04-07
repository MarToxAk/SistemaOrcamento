# BomCusto Orcamento

Plataforma full-stack para gestao de orcamentos com integracao ao Chatwoot e ingestao de dados do PDV legado.

## Stack

- Backend: NestJS + Prisma
- Frontend: Next.js (App Router)
- Banco principal: PostgreSQL
- Integracoes: Chatwoot API + conector PDV (read-only)

## Estrutura

```
apps/
  backend/
  frontend/
packages/
  shared/
docs/
```

## Comandos

1. Instalar dependencias

```bash
npm install
```

2. Configurar ambiente

```bash
cp .env.example .env
```

3. Banco principal

- O projeto esta configurado para usar PostgreSQL remoto em 72.60.253.108:5435.
- O Docker Compose local continua disponivel apenas como alternativa de desenvolvimento.

4. Subir PostgreSQL local (opcional)

```bash
npm run docker:up
```

5. Rodar migracoes (backend)

```bash
npm --workspace @bomcusto/backend run prisma:migrate
```

6. Rodar backend

```bash
npm run dev:backend
```

7. Rodar frontend

```bash
npm run dev:frontend
```

8. Build

```bash
npm run build
```

9. Testes

```bash
npm run test
```

## Documentacao

- Arquitetura: docs/ARCHITECTURE.md
- Modelo de dados: docs/DATA_MODEL.md
