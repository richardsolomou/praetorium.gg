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
- `catalogue/` — the community data, about 126MB, fetched by the instance itself.

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

## Dokploy

Deployed at `dokploy.ras.sh` as project **praetorium**, application **app**:

- Source: `richardsolomou/praetorium.gg`, `main`, built from the Dockerfile, auto-deploying on push through the Dokploy GitHub App.
- Volume `praetorium-data` mounted at `/data`.
- `APP_URL=https://praetorium.gg`, one replica.
- Domain `praetorium.gg` on port 3000 with a Let's Encrypt certificate.
- Image published to `ghcr.io/richardsolomou/praetorium.gg`.

The container and Traefik service are `praetorium-cgzzus`. Dokploy generates that suffix and will not let it be edited afterwards, so changing it means recreating the application: `application.update` ignores `appName`, while `application.create` accepts one and appends its own suffix. Detach the volume first (`mounts.remove`) — otherwise deleting the old application takes the volume with it, and with it the database and 127MB of catalogue.

First boot spends a minute or two fetching the catalogue, and the app is usable throughout. A push to `main` redeploys; the volume and its catalogue survive.

### Things that bite

- **Renaming the GitHub repository silently stops deploys.** Dokploy stores the repository name and keeps matching pushes against the old one, so commits look pushed and nothing ships. Repoint the source, then check that a push actually deploys.
- **Traefik does not retry a failed ACME attempt.** Add a hostname before its DNS resolves and Let's Encrypt answers `NXDOMAIN`; Traefik gives up and serves `CN=TRAEFIK DEFAULT CERT` indefinitely. Behind Cloudflare that is invisible from a browser, because the edge terminates TLS with its own certificate and does not check the origin's. Restarting `dokploy-traefik` is what makes it try again.
- **Add the hostname to Dokploy before moving DNS**, and let the certificate issue before changing `APP_URL`. A hostname with no Traefik router is a 404 — the app never sees the request, so its canonical-host redirect cannot rescue it.
- **A preview wildcard has to be one level below its apex.** `*.praetorium.gg` is covered by Cloudflare's Universal SSL and can be proxied like everything else. A wildcard two levels down is not, and every preview URL would fail TLS at the edge before reaching this box.
- **DNS is the one thing Dokploy cannot do from here.** A new hostname needs its record pointing at the origin before the certificate can be issued.
