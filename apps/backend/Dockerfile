FROM node:20-bookworm-slim AS base
WORKDIR /app

# Dependencias do Chromium para gerar PDF com Puppeteer sem baixar navegador adicional.
RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  ca-certificates \
  fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

FROM base AS deps
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci

FROM deps AS build
COPY . .
RUN npm --workspace @bomcusto/backend run prisma:generate -- --schema prisma/schema.prisma
RUN npm --workspace @bomcusto/backend run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 4000
CMD ["sh", "-c", "npm --workspace @bomcusto/backend run prisma:deploy -- --schema prisma/schema.prisma && npm --workspace @bomcusto/backend run start"]