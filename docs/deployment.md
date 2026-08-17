# Self-hosting

The hosted service at [praetorium.gg](https://praetorium.gg) is the supported way to use Praetorium. Self-hosting is available for operators who can manage Docker, persistent storage, backups, and a reverse proxy.

Private deployments do not include managed support. Review this page and the supplied `docker-compose.yml` before starting.

Praetorium runs as one container with one persistent `/data` volume. Copy `.env.example` to `.env`, review the settings, then start the Compose service.

```sh
cp .env.example .env
docker compose up -d
```

## Persistent data

- `praetorium.sqlite` stores accounts, lists, battles, and command logs.
- `auth.secret` signs account sessions. Replacing it signs everyone out but does not delete their data.
- `realtime-secret` signs Centrifugo tokens. Replacing it disconnects active realtime clients.
- `catalogue/` caches about 90MB of verified community data from the snapshot service.

Back up `praetorium.sqlite` and `auth.secret` together. The app can fetch the catalogue again.

## Catalogue sync

At startup and once an hour, the app reads `current.json` from Praetorium's shared public snapshot service, or from `CATALOGUE_SNAPSHOT_BASE_URL` when an operator configures a mirror. It downloads an archive only when that immutable snapshot ID differs from its local cache, verifies the archive, manifest, and every file, then swaps the complete directory into place atomically. Battles remain available while an initial snapshot downloads.

Running instances never contact upstream data providers. A separate hourly publisher resolves their latest revisions, validates a complete candidate, uploads its immutable archive, and replaces `current.json` only after a public read-back succeeds.

## One container, three processes

The image runs the app, Centrifugo, and Caddy. Caddy sends `/connection/*` to Centrifugo and all other requests to the app. The container stops if any process exits so the container runtime can restart the full service.

Run one replica. Multiple replicas cannot safely share the SQLite database. Move to a network database before adding replicas.

## Reverse proxy

The proxy must forward `X-Forwarded-Host` and `X-Forwarded-Proto`. Set `APP_URL` when those headers do not describe the public origin. When set, `APP_URL` is also the canonical origin. Requests for another host redirect to it and keep their path.

Use `GET /api/health` for health checks. This route does not redirect to `APP_URL`.
