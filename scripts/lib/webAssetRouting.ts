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

export function webAssetRouting(source: string, host: string) {
  const config = configuration.parse(parse(source))
  const candidates = Object.entries(config.http.routers).filter(
    ([, value]) => value.rule === `Host(\`${host}\`)` && value.entryPoints.includes('websecure') && value.tls,
  )
  if (candidates.length !== 1) throw new Error('Expected one HTTPS web router')
  const [name, web] = candidates[0]!
  if (!config.http.services[web.service]) throw new Error('Missing web service')
  const prefix = `${name}-assets`
  config.http.routers[prefix] = {
    ...web,
    rule: `${web.rule} && PathPrefix(\`/assets/\`) && (Method(\`GET\`) || Method(\`HEAD\`))`,
    priority: Math.max(web.priority ?? web.rule.length, 100) + 1,
    service: prefix,
    middlewares: [...(web.middlewares ?? []), `${prefix}-errors`, `${prefix}-path`, `${prefix}-headers`],
  }
  config.http.services[prefix] = {
    loadBalancer: { servers: [{ url: 'https://s3.praetorium.gg' }], passHostHeader: false },
  }
  config.http.middlewares ??= {}
  config.http.middlewares[`${prefix}-headers`] = {
    headers: {
      customRequestHeaders: {
        Cookie: '',
        Authorization: '',
        'Cf-Access-Jwt-Assertion': '',
        'CF-Access-Client-Id': '',
        'CF-Access-Client-Secret': '',
      },
    },
  }
  config.http.middlewares[`${prefix}-path`] = { replacePathRegex: { regex: '^/assets/(.*)', replacement: '/web-assets/${1}' } }
  // The application's asset miss already sends no-store, including on the first rollout.
  config.http.middlewares[`${prefix}-errors`] = {
    errors: { status: ['400-599'], service: web.service, query: '/assets/unavailable-{status}.js' },
  }
  return stringify(config)
}
