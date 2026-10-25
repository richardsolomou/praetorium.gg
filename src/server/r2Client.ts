import { AwsClient } from 'aws4fetch'
// scripts/nodeServer.ts runs this module under plain Node, which needs the extension.
import { localDevelopmentObjects } from './localObjectStore.ts'

function configuredClient(environment: NodeJS.ProcessEnv, prefix: string, bucket: string) {
  const account = environment.R2_ACCOUNT_ID
  const accessKeyId = environment[`${prefix}_ACCESS_KEY_ID`]
  const secretAccessKey = environment[`${prefix}_SECRET_ACCESS_KEY`]
  if (!account && !accessKeyId && !secretAccessKey) return null
  if (!/^[0-9a-f]{32}$/.test(account ?? '') || !accessKeyId || !secretAccessKey)
    throw new Error('Incomplete R2 object storage configuration')
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 2 }),
    base: `https://${account}.r2.cloudflarestorage.com/${bucket}/`,
  }
}

export function privateR2Client(environment: NodeJS.ProcessEnv = process.env) {
  return configuredClient(environment, 'R2', 'praetorium-private')
}

export function publicAssetsR2Client(environment: NodeJS.ProcessEnv = process.env) {
  return configuredClient(environment, 'ASSETS_R2', 'praetorium')
}

export function r2Objects({ client, base }: NonNullable<ReturnType<typeof configuredClient>>) {
  async function request(operation: 'head' | 'get' | 'put' | 'delete', key: string, init: RequestInit = {}) {
    const response = await client.fetch(`${base}${key}`, { ...init, signal: AbortSignal.timeout(operation === 'head' ? 10_000 : 30_000) })
    if (response.status === 404 && operation !== 'put') return null
    if (!response.ok) throw new Error(`R2 ${operation} failed with HTTP ${response.status}`)
    return response
  }
  return {
    head: async (key: string) => Boolean(await request('head', key, { method: 'HEAD' })),
    get: async (key: string) => {
      const response = await request('get', key)
      return response && new Uint8Array(await response.arrayBuffer())
    },
    put: async (key: string, body: Uint8Array, headers: Record<string, string>) => {
      await request('put', key, { method: 'PUT', body: new Uint8Array(body), headers })
    },
    delete: async (key: string) => {
      await request('delete', key, { method: 'DELETE' })
    },
  }
}

/** A local stack's on-disk objects, else the bucket `r2Client` configures, else null. */
export function objectsIn(
  environment: NodeJS.ProcessEnv,
  r2Client: (environment: NodeJS.ProcessEnv) => ReturnType<typeof configuredClient>,
) {
  const local = localDevelopmentObjects(environment)
  if (local) return local
  const r2 = r2Client(environment)
  return r2 ? r2Objects(r2) : null
}
