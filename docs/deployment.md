# Deployment

Praetorium runs as one container with one persistent `/data` volume.

```sh
cp .env.example .env
docker compose up -d
```

Or pull the image CI publishes:

```sh
docker run -d --name praetorium -p 3000:3000 -v praetorium-data:/data ghcr.io/richardsolomou/praetorium:latest
```

## What lands in /data

- `praetorium.sqlite` — every battle, its command log, and every saved list.
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

Deployed at `dokploy.ras.sh`, auto-deploying from `main`, built from the Dockerfile, one replica, with a volume mounted at `/data` and a Let's Encrypt certificate on port 3000.

**The rename to Praetorium is not finished on the host.** The code and this repository are renamed; the deployment is still under the old identifiers, so what is actually running is:

|                 | Now                             | Wants to be                                                   |
| --------------- | ------------------------------- | ------------------------------------------------------------- |
| Dokploy project | `muster`                        | `praetorium`                                                  |
| Application     | `muster-l3ujsu`                 | renamed, or left as-is — the generated suffix is cosmetic     |
| Volume          | `muster-data`                   | `praetorium-data`, **or left alone**                          |
| `APP_URL`       | `https://muster.ras.sh`         | `https://praetorium.ras.sh`                                   |
| Domain          | `muster.ras.sh`                 | `praetorium.ras.sh`                                           |
| Image           | `ghcr.io/richardsolomou/muster` | `ghcr.io/richardsolomou/praetorium` (follows the repo rename) |

### Finishing the rename

Two of these destroy data if done carelessly, so the order matters.

1. **DNS first.** `praetorium.ras.sh` needs a proxied record on Cloudflare pointing at the same origin as the other subdomains. Nothing else can be verified until it resolves, and Let's Encrypt will not issue before it does. Traefik does not retry a failed issuance on its own — it needs a restart or a dynamic-config reload.
2. **Leave the volume named `muster-data`.** Renaming a volume in Dokploy does not move it; it mounts a new empty one and the battles, the saved lists and both secrets are orphaned. The name is invisible to users. If it must be renamed, copy the contents across first.
3. **The database file changed name** — the app now opens `praetorium.sqlite`, and the volume holds `muster.sqlite`. On the first deploy of the renamed code it will create an empty database beside the old one. Rename the file **while the new image is deploying and the old container is down**, taking the WAL and shm with it:

   ```sh
   for suffix in "" "-wal" "-shm"; do
     mv "/data/muster.sqlite$suffix" "/data/praetorium.sqlite$suffix" 2>/dev/null || true
   done
   ```

4. **The cookie changed name too** (`muster_player` → `praetorium_player`), so every guest is signed out once and loses the lists tied to that identity. With no real users yet this costs nothing; it will not be free later.
5. Set `APP_URL` to the new origin, add the domain, and redeploy. Keep the old domain pointed at the app for as long as any battle link is still worth honouring — `APP_URL` redirects other hostnames to itself with the path intact, so old links keep working.

First boot spends a minute or two fetching the catalogue, and the app is usable throughout. A push to `main` redeploys; the volume and its catalogue survive.

The one thing Dokploy cannot do from here is DNS. `ras.sh` is on Cloudflare, so `praetorium.ras.sh` needs a proxied record pointing at the same origin as the other subdomains before the certificate can be issued and the host will serve.
