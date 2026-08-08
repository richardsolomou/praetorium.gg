# Deployment

Praetorium runs as one container with one persistent `/data` volume.

```sh
cp .env.example .env
docker compose up -d
```

Or pull the image CI publishes:

```sh
docker run -d --name praetorium -p 3000:3000 -v praetorium-data:/data ghcr.io/richardsolomou/praetorium.gg:latest
```

## Persistent data

- `praetorium.sqlite` stores accounts, lists, battles, and command logs.
- `auth.secret` signs account sessions. Replacing it signs everyone out but does not delete their data.
- `realtime-secret` signs Centrifugo tokens. Replacing it disconnects active realtime clients.
- `catalogue/` stores about 130MB of fetched community data.

Back up `praetorium.sqlite` and `auth.secret` together. The app can fetch the catalogue again.

## Catalogue sync

At startup, the app compares `/data/catalogue/revision.json` with the revisions pinned in the image. It fetches missing data in the background. Battles remain available during the sync. List building appears when the sync finishes.

Each source downloads to a staging directory before it replaces the current copy. An interrupted download does not replace valid catalogue data.

## One container, three processes

The image runs the app, Centrifugo, and Caddy. Caddy sends `/connection/*` to Centrifugo and all other requests to the app. The container stops if any process exits so the container runtime can restart the full service.

Run one replica. Multiple replicas cannot safely share the SQLite database. Move to a network database before adding replicas.

## Reverse proxy

The proxy must forward `X-Forwarded-Host` and `X-Forwarded-Proto`. Set `APP_URL` when those headers do not describe the public origin. When set, `APP_URL` is also the canonical origin. Requests for another host redirect to it and keep their path.

Use `GET /api/health` for health checks. This route does not redirect to `APP_URL`.
