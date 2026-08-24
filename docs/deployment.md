# Self-hosting

[praetorium.gg](https://praetorium.gg) is the supported service. Self-hosting requires Docker, persistent storage, backups, and a reverse proxy.

Private deployments do not include managed support. Read this page and `docker-compose.yml` before you start.

Praetorium runs as one container against a Postgres, a Valkey, and an S3-compatible store. The supplied `docker-compose.yml` starts all four, the last as a bundled MinIO. Copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`, then start the Compose project.

```sh
cp .env.example .env
docker compose up -d
```

## Data stores

`DATABASE_URL` is required. Postgres holds accounts, lists, battles, and command logs. Back up this store.

`VALKEY_URL` is optional. Valkey holds sessions, sign-in rate limits, and realtime fan-out. Leave it unset for one replica. Set it for multiple replicas.

`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` point the app at an S3-compatible store — Compose's bundled MinIO by default. A profile picture is uploaded there, keyed by its own hash, and only that short URL is written to the database; without this set, uploading one fails with a clear error instead of storing the picture somewhere it should not be. `S3_PUBLIC_BASE_URL` is where a browser reads those pictures (and, unset, the community catalogue) back from — Compose points it at MinIO's published port; production behind a proxy should point it at that store's public hostname instead.

The `/data` volume no longer holds game data. What remains is:

- `auth.secret` signs account sessions and encrypts OAuth access and refresh tokens. Replacing it signs everyone out and makes stored OAuth tokens unreadable, so affected users must reconnect their provider.
- `realtime-secret` signs Centrifugo tokens. Replacing it disconnects active realtime clients.
- `catalogue/` caches verified community data from the snapshot service.

Back up Postgres and `auth.secret` together. The app can fetch the catalogue again, and nothing in Valkey needs backing up.

## Schema migrations

The container applies migrations before it serves requests. A Postgres advisory lock serializes migrations across replicas.

To apply migrations by hand against `DATABASE_URL`:

```sh
just db-migrate
```

## Catalogue sync

At startup and once an hour, the app reads `current.json` from Praetorium's shared public snapshot service, or from `S3_PUBLIC_BASE_URL` when an operator configures a mirror. It downloads an archive only when that immutable snapshot ID differs from its local cache, verifies the archive, manifest, and every file, then swaps the complete directory into place atomically. Battles remain available while an initial snapshot downloads.

Running instances never contact upstream data providers. A separate hourly publisher resolves their latest revisions, validates a complete candidate, uploads its immutable archive, and replaces `current.json` only after a public read-back succeeds.

## One container, three processes

The image runs the app, Centrifugo, and Caddy. Caddy sends `/connection/*` to Centrifugo and all other requests to the app. The container stops if any process exits so the container runtime can restart the full service.

## Replicas

With `VALKEY_URL`, Centrifugo sends commands between replicas. Replicas also share sessions and rate-limit counters.

Without it, run one replica. Live updates then fan out inside a single process, and a second replica would serve battles that never hear each other's commands.

## Sessions

Sessions live in Valkey when `VALKEY_URL` is set, so replacing it or clearing it signs everyone in again. Accounts, lists, battles, and logs are unaffected.

## Accounts and OAuth

The first account with a sign-in method becomes the administrator. During an upgrade, the oldest account with a sign-in method becomes the administrator if none exists. Administrators can create accounts, change roles and passwords, revoke sessions, and impersonate another player for up to one hour.

Email and password sign-in needs no additional configuration. To add email verification and password recovery, set `SMTP_HOST`, `EMAIL_FROM`, and the other SMTP variables from `.env.example`. `SMTP_PORT` defaults to `587`; set `SMTP_SECURE=true` only when the SMTP service expects an implicit TLS connection. For Plunk, use the SMTP values shown for the sending domain in its dashboard.

To enable Google or Discord, create an OAuth application with the provider and set both matching variables from `.env.example`. Use these callback URLs, replacing the origin with the deployment's public origin:

- Google: `https://example.com/api/auth/callback/google`
- Discord: `https://example.com/api/auth/callback/discord`

The provider appears only when both its client ID and client secret are set. Set `APP_URL` to the same public origin when proxy headers do not describe it correctly.

If an email and password account already uses the provider's email address, sign in with the password and verify the address from Profile. A provider that reports the same verified email can then sign in to that account. Linking a provider from Profile still requires the provider to report the account's email address.

Upgrades from 0.25.0 or earlier must stop every replica before starting the new image. The upgrade begins encrypting OAuth access and refresh tokens, and an older replica cannot read tokens written by the new release. Stop every replica before a rollback too; users whose tokens were created or refreshed after the upgrade may need to reconnect their provider.

## Reverse proxy

The proxy must forward `X-Forwarded-Host` and `X-Forwarded-Proto`. Set `APP_URL` when those headers do not describe the public origin. When set, `APP_URL` is also the canonical origin. Requests for another host redirect to it and keep their path.

Use `GET /api/health` for health checks. This route does not redirect to `APP_URL`.
