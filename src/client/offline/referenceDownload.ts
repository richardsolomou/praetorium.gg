import type { OfflineAppVersion, OfflineReferenceData, OfflineReferenceVersion } from '../../contracts/offlineReference'
import { pack, referenceFields, serializeQuery, withConstruction } from './compressedReference'
import { constructionBundle, offlineApplication, referenceBundle } from './download'
import { restoredReference, type RestoredParts } from './referenceRestore'

export type DownloadRequest = {
  manifest: OfflineReferenceVersion
  version: OfflineAppVersion
  constructionUrl: string
  allRulesVersions: boolean
  /**
   * The download the page holds: its reference when this download keeps it, and its construction data still packed
   * when this download keeps that.
   */
  held: { revision: string; parts?: NonNullable<RestoredParts>; construction?: string } | null
  /** Absolute, because an inline worker resolves relative addresses against its `blob:` URL. */
  origin: string
}

export type DownloadMessage =
  | { kind: 'reference'; parts: NonNullable<RestoredParts> }
  | { kind: 'saved'; parts: NonNullable<RestoredParts>; html: string; savedAt: number }

export function partsOf(data: OfflineReferenceData, construction?: string): NonNullable<RestoredParts> {
  const { queries, ...reference } = referenceFields(data)
  return { reference, queries: queries.map(serializeQuery), ...(construction ? { construction } : {}) }
}

/**
 * Downloads and packs a new offline application, reporting a new reference before its construction data so pages
 * can use it first. Parsing, packing and assembling the application each block for hundreds of milliseconds on a
 * phone, so this runs in a worker.
 */
export async function downloadReference(request: DownloadRequest, post: (message: DownloadMessage) => void, signal: AbortSignal) {
  const { manifest, version, origin, held } = request
  const at = (path: string) => new URL(path, origin).href
  const kept = held?.revision === manifest.revision && held.parts ? restoredReference(held.parts) : null
  const reference = kept ?? (await referenceBundle({ ...manifest, bundle: at(manifest.bundle) }, signal))
  const content: OfflineReferenceData = {
    version: 1,
    revision: reference.revision,
    queries: reference.queries,
    search: reference.search,
    savedAt: Date.now(),
    css: '',
    logo: '',
    allRulesVersions: request.allRulesVersions,
  }
  if (!kept) post({ kind: 'reference', parts: partsOf(content) })
  const construction = held?.construction ?? (await pack(await constructionBundle(at(request.constructionUrl), signal), signal))
  const application = await offlineApplication(
    withConstruction({ ...content, constructionBundle: request.constructionUrl }, construction),
    version,
    signal,
    origin,
  )
  post({ kind: 'saved', parts: partsOf(application.data, construction), html: application.html, savedAt: application.savedAt })
}
