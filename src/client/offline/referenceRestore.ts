import { MAX_OFFLINE_BYTES, type OfflineReferenceData } from '../../contracts/offlineReference'
import { embeddedReferenceJson } from '../../contracts/embeddedReference'
import { lazyQueries, restoreReferenceParts, withConstruction } from './compressedReference'

export const REFERENCE_CACHE = 'praetorium-reference-v2'

/** A saved reference as a worker hands it over: each query still serialized, construction data still packed. */
export type RestoredParts = Awaited<ReturnType<typeof restoreReferenceParts>>

/** The download embedded in a saved offline application, still packed. */
export function savedPackedReference(html: string): unknown {
  if (html.length > MAX_OFFLINE_BYTES) return null
  const serialized = embeddedReferenceJson(html)
  if (!serialized) return null
  try {
    return JSON.parse(serialized)
  } catch {
    return null
  }
}

export const SAVED_APPLICATION = '/offline-reference.html'

/**
 * Decodes a native injection, or the saved offline application at `saved`, for the main thread to read query by
 * query. The address is absolute because an inline worker resolves relative ones against its `blob:` URL.
 */
export async function restoreParts(packed: unknown, saved: string): Promise<RestoredParts> {
  let source = packed
  if (source === undefined) {
    const response = await (await caches.open(REFERENCE_CACHE)).match(saved)
    source = response ? savedPackedReference(await response.text()) : null
  }
  return restoreReferenceParts(source)
}

/** The restored reference, whose queries are parsed only when a page reads them. */
export function restoredReference(parts: NonNullable<RestoredParts>): OfflineReferenceData {
  const data: OfflineReferenceData = { ...parts.reference, queries: lazyQueries(parts.queries) }
  return parts.construction ? withConstruction(data, parts.construction) : data
}
