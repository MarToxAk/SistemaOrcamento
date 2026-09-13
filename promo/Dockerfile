# Microsite de sorteio Dia das Criancas — standalone, sem dependencia com o
# app de orcamento nem com o Athos (D-01, D-02).
#
# Piso Node 24 e proposital: o modulo nativo node:sqlite exigia flag
# experimental nas versoes 22.5 a 23.3 e passou a funcionar sem flag depois
# disso. Nao rebaixar esta base.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3100 \
    PROMO_DB_PATH=/data/promo.db

# Sem npm ci nem node_modules neste estagio: o servidor (node:http +
# node:sqlite) nao tem NENHUMA dependencia de runtime.
COPY package.json ./
COPY server/ ./server/
COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
