---
name: Infraestrutura e Deploy
description: Docker, CI/CD GitHub Actions, Nginx, Tailscale VPN e configuração de produção
type: project
originSessionId: 8a62ac3a-fd0b-49ab-ace5-c246d2a1fdd0
---
# Infraestrutura e Deploy

## Ambiente Local (docker-compose.yml)

Único serviço: **postgres** (postgres:16-alpine)
- Porta: `5435:5432`
- Banco: `bomcusto`
- Volume: `bomcusto_pg_data`

Backend e frontend rodam localmente via npm (não no Docker local).

## Produção (deploy/docker-compose.vps.yml)

4 serviços:

| Serviço | Imagem | Porta | Papel |
|---------|--------|-------|-------|
| `ts-webserver2` | Tailscale | 4001:4000 | VPN / túnel seguro |
| `postgres` | postgres:16-alpine | 5435:5432 | Banco de dados |
| `backend` | ghcr.io/martoxak/bomcusto-backend:latest | via Tailscale | API NestJS |
| `frontend` | ghcr.io/martoxak/bomcusto-frontend:latest | 3001:3000 | Web UI |

O backend fica acessível via Tailscale (não exposto diretamente).

## CI/CD — GitHub Actions (`.github/workflows/`)

| Workflow | Arquivo | Função |
|----------|---------|--------|
| CI | `ci.yml` | Testes e type check |
| Build & Publish | `build-and-publish.yml` | Build Docker e push para ghcr.io |
| Deploy Prod | `deploy.yml` | Deploy na VPS de produção |
| Deploy Dev | `deploy-dev.yml` | Deploy em ambiente de desenvolvimento |
| Deploy Portainer | `deploy-portainer.yml` | Deploy via Portainer |

**Registry**: `ghcr.io/martoxak/` (GitHub Container Registry)

## Nginx (`deploy/nginx.conf`)
Reverse proxy na VPS:
- Roteia `/api/*` para o backend
- Roteia resto para o frontend
- Terminação SSL

## Variáveis de Ambiente de Produção
Template em `deploy/stack.env.example` — contém todas as ~41 variáveis necessárias.

## Scripts Utilitários (`scripts/`)
- `convert_pem_to_base64.py` — converte certificados EFI PEM → base64 para env vars
- `test-puburl-db.mjs` — testa conectividade com banco via URL pública
- `test-puburl-final.mjs` — validação final de URLs públicas

**Why:** Tailscale elimina a necessidade de expor o backend publicamente; só o frontend e o Nginx ficam visíveis.
**How to apply:** Ao adicionar nova variável de ambiente, atualizar tanto `.env.example` quanto `deploy/stack.env.example`.
