import { importRosterSchema } from '../contracts/schemas'
import { fetchWithRetry } from './fetch'

const shareApi = 'https://list-forge.fly.dev/api/shares/'
const payloadOrigin = 'https://listforge-profiles.a26a5df71d419777c9a639f8887c1034.r2.cloudflarestorage.com'

/** Reads the same Detailed Text export that ListForge's public share viewer receives. */
export async function listForgeShareText(code: string) {
  const metadata = await fetchWithRetry(new URL(encodeURIComponent(code), shareApi), { redirect: 'error' })
  if (metadata.status === 404 || metadata.status === 410) return null
  if (!metadata.ok) throw new Error('ListForge share lookup failed')
  const share = (await metadata.json()) as { payloadUrl?: unknown } | null
  const url = typeof share?.payloadUrl === 'string' ? URL.parse(share.payloadUrl) : null
  if (!url || url.origin !== payloadOrigin || url.username || url.password) return null
  const payload = await fetchWithRetry(url, { redirect: 'error' })
  if (payload.status === 404 || payload.status === 410) return null
  if (!payload.ok) throw new Error('ListForge share download failed')
  const data = (await payload.json()) as { detailedText?: unknown } | null
  const parsed = importRosterSchema.safeParse({ file: typeof data?.detailedText === 'string' ? data.detailedText.trim() : null })
  return parsed.success ? parsed.data.file : null
}
