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

## What lands in /data

- `praetorium.sqlite` — every battle, its command log, and every saved list.
- `auth.secret` — signs sessions. Losing it signs everyone out; their accounts and lists survive.
- `realtime-secret` — signs the tokens the browser connects to Centrifugo with. Generated on first boot; losing it costs one reconnect.
- `catalogue/` — the community data, about 130MB, fetched by the instance itself.

Back up the database and the secret together. The catalogue is disposable: it is pinned in the image and re-fetched if deleted.

## The catalogue fetches itself

On boot, the instance compares `/data/catalogue/revision.json` against the revisions pinned in the image and fetches anything missing in the background. It starts and serves battles immediately either way — list building appears when the data lands, and the interface says so while it is on its way.

Nothing needs to be run by hand. A deploy carrying new pinned revisions fetches them on its next boot, and each source is written to a staging directory and swapped in, so a fetch that dies halfway cannot leave a half-written catalogue that looks complete.

## One container, three processes

The image runs Centrifugo, the app and Caddy together, and Caddy is what makes that one port: `/connection/*` goes to Centrifugo and everything else to the app. Any of the three dying takes the container down so the whole thing restarts rather than serving half a deployment.

Centrifugo handles fan-out, so replicas would hear about each other's commands. They would still share one SQLite file, so `docker-compose.yml` keeps `replicas: 1` — scaling out means moving the database first.

## Reverse proxy

The proxy must forward `X-Forwarded-Host` and `X-Forwarded-Proto`. Set `APP_URL` when it cannot represent the public origin through those headers; when set, it is also the canonical host and requests arriving on any other hostname are redirected to it with the path intact, so a battle link shared before a rename keeps working.

`GET /api/health` is the health endpoint and is exempt from that redirect: the container checks itself over 127.0.0.1, and redirecting would send the check to a different machine.
