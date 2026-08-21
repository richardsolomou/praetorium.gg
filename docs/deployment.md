# Self-hosting

The hosted service at [praetorium.gg](https://praetorium.gg) is the supported way to use Praetorium. Self-hosting is available for operators who can manage Docker, persistent storage, backups, and a reverse proxy.

Private deployments do not include managed support. Review this page and the supplied `docker-compose.yml` before starting.

Praetorium runs as one container against a Postgres and a Valkey. The supplied `docker-compose.yml` starts all three. Copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`, then start the Compose project.

```sh
cp .env.example .env
docker compose up -d
```

## Data stores

`DATABASE_URL` is required. It holds accounts, lists, battles, and every command in their logs. This is the only store that must be backed up.

`VALKEY_URL` is optional and holds sessions, the sign-in rate limiter, and Centrifugo's fan-out between replicas. Leave it unset to run a single replica: sessions then live in Postgres and live updates fan out inside the process. Set it to run more than one.

The `/data` volume no longer holds game data. What remains is:

- `auth.secret` signs account sessions. Replacing it signs everyone out but does not delete their data.
- `realtime-secret` signs Centrifugo tokens. Replacing it disconnects active realtime clients.
- `catalogue/` caches verified community data from the snapshot service.

Back up Postgres and `auth.secret` together. The app can fetch the catalogue again, and nothing in Valkey needs backing up.

## Schema migrations

The container applies migrations on the way up, before the app serves a request, and takes a Postgres advisory lock while it does. Several replicas starting together therefore take turns rather than racing, and no replica answers a request against a schema that is still moving.

To apply migrations by hand against `DATABASE_URL`:

```sh
just db-migrate
```

## Catalogue sync

At startup and once an hour, the app reads `current.json` from Praetorium's shared public snapshot service, or from `CATALOGUE_SNAPSHOT_BASE_URL` when an operator configures a mirror. It downloads an archive only when that immutable snapshot ID differs from its local cache, verifies the archive, manifest, and every file, then swaps the complete directory into place atomically. Battles remain available while an initial snapshot downloads.

Running instances never contact upstream data providers. A separate hourly publisher resolves their latest revisions, validates a complete candidate, uploads its immutable archive, and replaces `current.json` only after a public read-back succeeds.

## One container, three processes

The image runs the app, Centrifugo, and Caddy. Caddy sends `/connection/*` to Centrifugo and all other requests to the app. The container stops if any process exits so the container runtime can restart the full service.

## Replicas

With `VALKEY_URL` set, more than one replica is safe. Centrifugo uses Valkey as its engine, so a command taken by one replica reaches a page connected to another, and sessions and rate-limit counters are shared rather than held once per replica.

Without it, run one replica. Live updates then fan out inside a single process, and a second replica would serve battles that never hear each other's commands.

## Sessions

Sessions live in Valkey when `VALKEY_URL` is set, so replacing it or clearing it signs everyone in again. Accounts, lists, battles, and logs are unaffected.

## Reverse proxy

The proxy must forward `X-Forwarded-Host` and `X-Forwarded-Proto`. Set `APP_URL` when those headers do not describe the public origin. When set, `APP_URL` is also the canonical origin. Requests for another host redirect to it and keep their path.

Use `GET /api/health` for health checks. This route does not redirect to `APP_URL`.
