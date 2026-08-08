# syntax=docker/dockerfile:1
# Both binaries are built from source at a pinned revision with its checksum
# verified, rather than pulled as prebuilt images: this is the one place a
# container gets code nobody here wrote.
FROM golang:1.26-alpine AS realtime
ARG CENTRIFUGO_COMMIT=4603be29243501f4ac2787de17c4f0428b27864e
ARG CENTRIFUGO_SOURCE_SHA256=ba8d3d98a9cb14b7f864dc4a72801302f06a9292eb551b00cddf0c80d3188ea0
WORKDIR /src
RUN wget -q "https://github.com/centrifugal/centrifugo/archive/${CENTRIFUGO_COMMIT}.tar.gz" -O centrifugo.tar.gz \
    && echo "${CENTRIFUGO_SOURCE_SHA256}  centrifugo.tar.gz" | sha256sum -c - \
    && tar -xzf centrifugo.tar.gz \
    && cd "centrifugo-${CENTRIFUGO_COMMIT}" \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -X github.com/centrifugal/centrifugo/v6/internal/build.Version=6.9.1' -o /usr/local/bin/centrifugo .

FROM golang:1.26-alpine AS proxy
ARG CADDY_SOURCE_SHA256=2c3d02078286a6282cdb4d1d8744077788d556659dac0b64d8ed5886a7e5aeb9
WORKDIR /src
RUN wget -q https://github.com/caddyserver/caddy/archive/refs/tags/v2.11.4.tar.gz -O caddy.tar.gz \
    && echo "${CADDY_SOURCE_SHA256}  caddy.tar.gz" | sha256sum -c - \
    && tar -xzf caddy.tar.gz \
    && cd caddy-2.11.4 \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -X github.com/caddyserver/caddy/v2.CustomVersion=v2.11.4' -o /usr/local/bin/caddy ./cmd/caddy

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
COPY --from=proxy /usr/local/bin/caddy /usr/local/bin/caddy
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
