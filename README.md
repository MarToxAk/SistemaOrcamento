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

## Deploy automatico no VPS (Docker + Portainer)

1. Configure a stack no Portainer usando o arquivo `deploy/docker-compose.vps.yml`.
2. Configure as variaveis de ambiente no Portainer (`DATABASE_URL`, `MINIO_*`, `CHATWOOT_*`, etc).
3. Publique as imagens no GHCR com o workflow `.github/workflows/deploy-portainer.yml`.
4. Adicione no GitHub Secrets o `PORTAINER_WEBHOOK_URL`.
5. A cada push na branch `main`, o workflow publica imagens novas e dispara o webhook do Portainer para atualizar a stack no VPS.
