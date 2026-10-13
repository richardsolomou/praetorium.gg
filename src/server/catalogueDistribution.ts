import lock from '../../catalogue.json' with { type: 'json' }
import { fetchWithRetry } from './fetch'

export const catalogueReleaseUrl = (id: string, file: string) =>
  `https://github.com/${lock.authoring.repository}/releases/download/catalogue-${id}/${file}`

export async function fetchCatalogueArtifact(primary: string, mirror: string) {
  let response: Response
  try {
    response = await fetchWithRetry(primary, { signal: AbortSignal.timeout(60_000) })
  } catch {
    return fetchWithRetry(mirror, { signal: AbortSignal.timeout(60_000) })
  }
  if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 404 && response.status !== 429)) {
    return response
  }
  await response.body?.cancel()
  return fetchWithRetry(mirror, { signal: AbortSignal.timeout(60_000) })
}
