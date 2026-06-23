FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .

# White-label: NEXT_PUBLIC_* sao inlinadas no bundle JS em build-time.
# Passe via --build-arg (ou build.args no compose) para gerar uma imagem por empresa.
# Sem args, caem nos fallbacks definidos em src/lib/empresa.ts.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_EMPRESA_NOME
ARG NEXT_PUBLIC_EMPRESA_CNPJ
ARG NEXT_PUBLIC_EMPRESA_ENDERECO
ARG NEXT_PUBLIC_EMPRESA_EMAIL
ARG NEXT_PUBLIC_EMPRESA_LOGO_URL
ARG NEXT_PUBLIC_EMPRESA_COR_PRIMARIA
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_EMPRESA_NOME=${NEXT_PUBLIC_EMPRESA_NOME} \
    NEXT_PUBLIC_EMPRESA_CNPJ=${NEXT_PUBLIC_EMPRESA_CNPJ} \
    NEXT_PUBLIC_EMPRESA_ENDERECO=${NEXT_PUBLIC_EMPRESA_ENDERECO} \
    NEXT_PUBLIC_EMPRESA_EMAIL=${NEXT_PUBLIC_EMPRESA_EMAIL} \
    NEXT_PUBLIC_EMPRESA_LOGO_URL=${NEXT_PUBLIC_EMPRESA_LOGO_URL} \
    NEXT_PUBLIC_EMPRESA_COR_PRIMARIA=${NEXT_PUBLIC_EMPRESA_COR_PRIMARIA}

RUN npm --workspace @bomcusto/frontend run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=build /app/apps/frontend/public ./apps/frontend/public
COPY --from=build /app/apps/frontend/package.json ./apps/frontend/package.json
COPY --from=build /app/apps/frontend/next.config.mjs ./apps/frontend/next.config.mjs
COPY --from=build /app/apps/frontend/next-env.d.ts ./apps/frontend/next-env.d.ts
COPY --from=build /app/apps/frontend/tsconfig.json ./apps/frontend/tsconfig.json
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "--workspace", "@bomcusto/frontend", "run", "start"]