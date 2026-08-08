# syntax=docker/dockerfile:1
FROM centrifugo/centrifugo:v6.9.1@sha256:8ba0c9443dadedc21b20254b3fc76f35c1998b29acc7cdec877ea0c3636c237e AS realtime

FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 AS proxy

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack install --global pnpm@11.15.0
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY package.json ./package.json
RUN pnpm install --offline --frozen-lockfile
COPY src ./src
COPY public ./public
COPY drizzle ./drizzle
COPY catalogue ./catalogue
COPY tsconfig.json vite.config.ts ./
RUN pnpm build

FROM node:24-alpine
LABEL org.opencontainers.image.title="Praetorium" \
      org.opencontainers.image.description="Live Warhammer 40,000 battle tracking for two players." \
      org.opencontainers.image.licenses="AGPL-3.0-only"
WORKDIR /app
RUN mkdir -p /data && chown -R node:node /app /data
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=realtime /usr/local/bin/centrifugo /usr/local/bin/centrifugo
COPY --from=proxy /usr/bin/caddy /usr/local/bin/caddy
COPY --chown=node:node realtime.json Caddyfile ./
COPY --chown=node:node scripts/container-entrypoint.sh ./container-entrypoint.sh
COPY --chown=node:node LICENSE ./
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1
USER node
CMD ["./container-entrypoint.sh"]
