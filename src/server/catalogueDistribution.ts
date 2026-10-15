import { fetchWithRetry } from './fetch'

export const catalogueReleaseUrl = (id: string, file: string) =>
  `https://github.com/richardsolomou/praetorium.gg/releases/download/catalogue-${id}/${file}`

// The timeout also bounds reading the body, which for a snapshot archive is tens of megabytes.
const ARTIFACT_REQUEST = { timeoutMs: 60_000 }

export async function fetchCatalogueArtifact(primary: string, mirror: string) {
  let response: Response
  try {
    response = await fetchWithRetry(primary, {}, ARTIFACT_REQUEST)
  } catch {
    return fetchWithRetry(mirror, {}, ARTIFACT_REQUEST)
  }
  if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 404 && response.status !== 429)) {
    return response
  }
  await response.body?.cancel()
  return fetchWithRetry(mirror, {}, ARTIFACT_REQUEST)
}
