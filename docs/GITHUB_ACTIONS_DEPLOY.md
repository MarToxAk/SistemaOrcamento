# Workflows de CI / Build / Deploy

Este documento descreve os workflows adicionados para compilar, gerar imagens Docker e fazer deploy via SSH.

Arquivos criados:
- [.github/workflows/ci.yml](.github/workflows/ci.yml)
- [.github/workflows/build-and-publish.yml](.github/workflows/build-and-publish.yml)
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

Secrets necessários (defina em Settings → Secrets):
- `DOCKERHUB_USERNAME` — seu usuário do Docker Hub.
- `DOCKERHUB_TOKEN` — token (ou senha) do Docker Hub para autenticação no push/pull.
- `GITHUB_TOKEN` — fornecido automaticamente (usado para checkout e ações internas).
- `SSH_HOST` — host/IP do servidor de destino.
- `SSH_USER` — usuário SSH para deploy.
- `SSH_PRIVATE_KEY` — chave privada (sem passphrase preferencialmente) para conectar via SSH.
- `SSH_PORT` — (opcional) porta SSH; padrão 22.
- `DEPLOY_PATH` — diretório no servidor onde está o `deploy/docker-compose.vps.yml`.

Fluxo:
- Push para `main` dispara `ci.yml` e `build-and-publish.yml`.
- Ao finalizar com sucesso o `build-and-publish.yml`, o `deploy.yml` acionará e rodará os comandos remotos via SSH para dar `docker compose pull` e `docker compose up -d`.

Observações:
- As imagens são publicadas em `DOCKERHUB_USERNAME/bomcusto-backend` e `DOCKERHUB_USERNAME/bomcusto-frontend` (substitua `DOCKERHUB_USERNAME`).
- No servidor remoto, o deploy executa `docker login` no Docker Hub usando `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` antes de `docker compose pull`.
- Ajuste `deploy/docker-compose.vps.yml` e `deploy/.env` no servidor conforme necessário.

Como testar localmente antes do deploy:
```bash
# rodar build localmente
npm run build

# forçar workflow manualmente: git push origin main
```
