# Deployment

Muster runs as one container with one persistent `/data` volume.

```sh
cp .env.example .env
docker compose up -d
```

Or pull the image CI publishes:

```sh
docker run -d --name muster -p 3000:3000 -v muster-data:/data ghcr.io/richardsolomou/muster:latest
```

## What lands in /data

- `muster.sqlite` — every battle, its command log, and every saved list.
- `session.secret` — signs the guest cookies. Losing it signs everyone out, which costs them their saved lists.
- `catalogue/` — the community data, about 126MB, fetched by the instance itself.

Back up the database and the secret together. The catalogue is disposable: it is pinned in the image and re-fetched if deleted.

## The catalogue fetches itself

On boot, the instance compares `/data/catalogue/revision.json` against the revisions pinned in the image and fetches anything missing in the background. It starts and serves battles immediately either way — list building appears when the data lands, and the interface says so while it is on its way.

Nothing needs to be run by hand. A deploy carrying new pinned revisions fetches them on its next boot, and each source is written to a staging directory and swapped in, so a fetch that dies halfway cannot leave a half-written catalogue that looks complete.

## One instance

Live updates fan out inside the process. A second replica would serve battles that never hear about each other's commands, so `docker-compose.yml` pins `replicas: 1`. Moving the fan-out to Postgres `LISTEN`/`NOTIFY` has to come before scaling out — see the note in [CLAUDE.md](../CLAUDE.md).

## Reverse proxy

The proxy must forward `X-Forwarded-Host` and `X-Forwarded-Proto`. Set `APP_URL` when it cannot represent the public origin through those headers; when set, it is also the canonical host and requests arriving on any other hostname are redirected to it with the path intact, so a battle link shared before a rename keeps working.

`GET /api/health` is the health endpoint and is exempt from that redirect: the container checks itself over 127.0.0.1, and redirecting would send the check to a different machine.

## Dokploy

Deployed at `dokploy.ras.sh` as project **muster**, application **app**:

- Source: this repository, `main`, built from the Dockerfile, auto-deploying on push.
- Volume `muster-data` mounted at `/data`.
- `APP_URL=https://muster.ras.sh`, one replica.
- Domain `muster.ras.sh` on port 3000 with a Let's Encrypt certificate.

First boot spends a minute or two fetching the catalogue, and the app is usable throughout. A push to `main` redeploys; the volume and its catalogue survive.

The one thing Dokploy cannot do from here is DNS. `ras.sh` is on Cloudflare, so `muster.ras.sh` needs a proxied record pointing at the same origin as the other subdomains before the certificate can be issued and the host will serve.
