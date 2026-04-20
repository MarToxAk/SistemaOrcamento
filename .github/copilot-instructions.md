# Project Guidelines

## Code Style
- Mantenha mudanças pequenas e focadas no pedido.
- Preserve o estilo existente dos arquivos; evite reformatar partes nao relacionadas.
- Use nomes claros e consistentes para arquivos, funcoes e variaveis.
- No backend, siga o padrao atual de modulos NestJS com DTOs validados por class-validator.

## Architecture
- O repositorio usa monorepo npm workspaces com apps/backend, apps/frontend e packages/shared.
- Backend (NestJS + Prisma) e o ponto central de regras de negocio e integracoes externas.
- Frontend (Next.js App Router) consome API interna para operacao comercial.
- Integracoes externas: Chatwoot e PDV read-only na V1.
- Para detalhes de blocos e limites, consulte [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Build and Test
- Comandos padrao do workspace:
  - npm install
  - npm run dev:backend
  - npm run dev:frontend
  - npm run build
  - npm run test
- Fluxo de banco principal com Prisma:
  - npm --workspace @bomcusto/backend run prisma:migrate
  - npm --workspace @bomcusto/backend run prisma:generate
- Banco principal atual e remoto (VPS) e o docker-compose local e opcional para desenvolvimento.
- Ao alterar comportamento, rode ao menos build e validacoes relacionadas antes de concluir.

## Conventions
- Prefira documentacao por link em vez de duplicar conteudo.
- Modelo de dados e indices devem seguir [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
- Estado atual importante: o servico de orcamentos ja usa persistencia Prisma em [apps/backend/src/modules/quotes/quotes.service.ts](apps/backend/src/modules/quotes/quotes.service.ts); mantenha compatibilidade com payload legado em novas evolucoes.
- Integracoes devem falhar de forma segura: se variaveis de ambiente estiverem ausentes, retornar erro claro e nao quebrar o processo inteiro.
- Mantenha segredos fora do codigo, nunca commite tokens/senhas, e use .env apenas localmente.
- Quando o escopo crescer, criar instrucoes por area com applyTo para backend, frontend e testes em vez de aumentar esta instrucao global.
