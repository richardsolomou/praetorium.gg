import { DokployClient } from 'ras-stack/preview/dokploy'
import { requiredEnv } from './requiredEnv.ts'

export type DokployApi = <T>(procedure: string, options?: { query?: Record<string, string>; body?: unknown }) => Promise<T>

/** Dokploy calls that each give up after `timeoutMs`, without logging. */
export function dokployApi(
  url: string,
  apiKey: string,
  environmentId: string,
  request: typeof fetch = fetch,
  timeoutMs = 30_000,
): DokployApi {
  const client = new DokployClient({ url, apiKey, environmentId, fetch: request, log: () => {} })
  return (procedure, options = {}) => client.api(procedure, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

/** The web application `DOKPLOY_APPLICATION_ID` names, refused unless it is `web` in `DOKPLOY_ENVIRONMENT_ID`. */
export function dokployWebApplication<T extends object>(environment: NodeJS.ProcessEnv, request?: typeof fetch, timeoutMs?: number) {
  const origin = new URL(requiredEnv('DOKPLOY_URL', environment))
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Dokploy URL')
  const applicationId = requiredEnv('DOKPLOY_APPLICATION_ID', environment)
  const environmentId = requiredEnv('DOKPLOY_ENVIRONMENT_ID', environment)
  const api = dokployApi(origin.origin, requiredEnv('DOKPLOY_API_KEY', environment), environmentId, request, timeoutMs)
  const inspect = async () => {
    const application = await api<T & { applicationId: string; environmentId: string; name: string }>('application.one', {
      query: { applicationId },
    })
    if (application?.applicationId !== applicationId || application.environmentId !== environmentId || application.name !== 'web') {
      throw new Error('Unexpected Dokploy web application')
    }
    return application
  }
  return { api, applicationId, inspect }
}
