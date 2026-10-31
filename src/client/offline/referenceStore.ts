import { decodeReferencePart, isOfflineReferenceData, referenceAssets, type OfflineReferenceData } from '../../contracts/offlineReference'
import { withTimeout } from '../abortSignals'

/** Where the device keeps the saved offline application, its record, and each downloaded part as it was published. */
export const REFERENCE_CACHE = 'praetorium-reference-v3'
/** The single-file download earlier releases saved, deleted once a download replaces it. */
const LEGACY_REFERENCE_CACHE = 'praetorium-reference-v2'
export const SAVED_APPLICATION = '/offline-reference.html'
const SAVED_RECORD = '/offline-reference.json'

const openStore = () => caches.open(REFERENCE_CACHE)

async function gunzippedText(response: Response, limit: number) {
  const reader = response.body!.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return text
      text += value
      if (text.length > limit) throw new Error('A downloaded part exceeds its size limit')
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

/**
 * Decodes one downloaded part, at most `limit` characters of JSON. A part the device has not stored, such as one
 * another tab has since replaced, is read from the service when `network` allows; parts never change at an address.
 */
export async function readPart(asset: string, limit: number, network: boolean): Promise<unknown> {
  const store = await openStore()
  const stored = await store.match(asset, { ignoreVary: true })
  if (stored)
    try {
      return decodeReferencePart(await gunzippedText(stored, limit))
    } catch (error) {
      // A damaged part is deleted, so the next download stores it again.
      await store.delete(asset)
      if (!network) throw error
    }
  const response = network ? await fetch(asset, { credentials: 'omit', signal: AbortSignal.timeout(60_000) }) : null
  if (!response?.ok || !response.body) throw new Error('This part of the download is unavailable')
  return decodeReferencePart(await gunzippedText(response, limit))
}

/** Stores a published part as its compressed response, without decoding it, unless the device already holds it. */
export async function storePart(asset: string, signal: AbortSignal) {
  const store = await openStore()
  if (await store.match(asset, { ignoreVary: true })) return
  const response = await fetch(asset, { credentials: 'omit', signal: withTimeout(signal, 60_000) })
  if (!response.ok) throw new Error('The reference download is unavailable')
  await store.put(asset, response)
}

export async function savedReference(): Promise<OfflineReferenceData | null> {
  const response = await (await openStore()).match(SAVED_RECORD)
  const value: unknown = await response?.json().catch(() => null)
  return isOfflineReferenceData(value) ? value : null
}

const savedAssets = (data: OfflineReferenceData) => [
  ...referenceAssets({ ...data.download, construction: { ...data.download.construction, editions: {} } }),
  ...data.editions.map((id) => data.download.construction.editions[id]!),
]

/**
 * Records a complete download, with the offline application the service worker opens when given one, then deletes
 * the parts neither it nor the download it replaces names, which another open tab may still be reading, and the
 * single-file download of earlier releases.
 */
export async function saveReference(data: OfflineReferenceData, application: string | null) {
  const store = await openStore()
  const replaced = await savedReference()
  if (application !== null)
    await store.put(SAVED_APPLICATION, new Response(application, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  await store.put(SAVED_RECORD, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }))
  const kept = new Set(
    [...savedAssets(data), ...(replaced ? savedAssets(replaced) : []), SAVED_APPLICATION, SAVED_RECORD].map(
      (path) => new URL(path, location.href).href,
    ),
  )
  for (const request of await store.keys()) if (!kept.has(request.url)) await store.delete(request)
  await caches.delete(LEGACY_REFERENCE_CACHE)
}
