# syntax=docker/dockerfile:1
FROM ghcr.io/richardsolomou/ras-stack-runtime-binaries:runtime-v1.0.0@sha256:5f82b2d53b93465bf91cc1bc90b292e94cbdd823cedd3f432dca94097e59163d AS runtime-binaries

FROM node:24-alpine AS build
WORKDIR /app
# No toolchain: nothing in the dependency tree compiles now that the database is
# reached over a socket rather than linked into the process.
RUN corepack enable && corepack install --global pnpm@11.15.0
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY package.json ./package.json
RUN pnpm install --offline --frozen-lockfile
COPY src ./src
COPY public ./public
COPY drizzle ./drizzle
COPY catalogue ./catalogue
COPY scripts/containerRuntime.ts scripts/importOnBoot.ts scripts/importSqlite.ts scripts/migrate.ts scripts/previewDatabase.ts scripts/previewEnv.ts scripts/seedPreview.ts ./scripts/
COPY ras-stack.assets.json tsconfig.json vite.config.ts vite.seed.config.ts ./
ARG VITE_POSTHOG_PROJECT_TOKEN
ARG VITE_POSTHOG_HOST
RUN VITE_POSTHOG_PROJECT_TOKEN=$VITE_POSTHOG_PROJECT_TOKEN VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST pnpm build

FROM node:24-alpine
LABEL org.opencontainers.image.title="Praetorium" \
      org.opencontainers.image.description="Live Warhammer 40,000 battle tracking for two players." \
      org.opencontainers.image.licenses="AGPL-3.0-only"
WORKDIR /app
RUN mkdir -p /data && chown -R node:node /app /data
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=runtime-binaries /usr/local/bin/centrifugo /usr/local/bin/centrifugo
COPY --from=runtime-binaries /usr/local/bin/caddy /usr/local/bin/caddy
COPY --chown=node:node realtime.json ./
COPY --chown=node:node LICENSE ./
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1
USER node
CMD ["node", ".output/server/container-runtime.mjs"]
