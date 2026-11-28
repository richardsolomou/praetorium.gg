import { parse, stringify } from 'yaml'
import { z } from 'zod'

const router = z
  .object({
    rule: z.string(),
    service: z.string(),
    entryPoints: z.array(z.string()),
    middlewares: z.array(z.string()).optional(),
    priority: z.number().optional(),
    tls: z.unknown().optional(),
  })
  .loose()
const configuration = z
  .object({
    http: z
      .object({
        routers: z.record(z.string(), router),
        services: z.record(z.string(), z.unknown()),
        middlewares: z.record(z.string(), z.unknown()).optional(),
      })
      .loose(),
  })
  .loose()

/**
 * The Dokploy Traefik configuration with `/assets/` left to the web replicas, which serve their own release's files and
 * read other releases' from the bucket's API (`bucketAssets`), instead of a route through the bucket's public domain,
 * whose first read of each new file from hera's Cloudflare edge can take minutes.
 */
export function withoutBucketAssetRoute(source: string, host: string) {
  const config = configuration.parse(parse(source))
  const candidates = Object.entries(config.http.routers).filter(
    ([, value]) => value.rule === `Host(\`${host}\`)` && value.entryPoints.includes('websecure') && value.tls,
  )
  if (candidates.length !== 1) throw new Error('Expected one HTTPS web router')
  const [name, web] = candidates[0]!
  if (!config.http.services[web.service]) throw new Error('Missing web service')
  const prefix = `${name}-assets`
  if (!config.http.routers[prefix]) return source
  delete config.http.routers[prefix]
  delete config.http.services[prefix]
  for (const middleware of Object.keys(config.http.middlewares ?? {}))
    if (middleware.startsWith(`${prefix}-`)) delete config.http.middlewares![middleware]
  return stringify(config)
}
