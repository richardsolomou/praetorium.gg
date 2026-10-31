import {
  referencePart,
  type OfflineConstructionSource,
  type OfflineReferenceData,
  type ReferenceQuery,
} from '../../contracts/offlineReference'
import type { GlobalSearchIndex } from '../../core/referenceSearch'

/** Parts a test saved, by address; `storedPartReader` stands in for `./referenceStore` reading them. */
export const storedParts = new Map<string, unknown>()

export const storedPartReader = {
  readPart: async (asset: string) => {
    if (!storedParts.has(asset)) throw new Error('This part of the download is unavailable')
    return structuredClone(storedParts.get(asset))
  },
}

const EMPTY_SEARCH: GlobalSearchIndex = { factions: [], detachments: [], datasheets: [], missions: [], rules: [] }
let downloads = 0

/** A saved download holding `queries` and `construction` in the parts the build publishes them in; each call stores its own parts. */
export function savedDownload(
  queries: ReferenceQuery[],
  {
    search = EMPTY_SEARCH,
    revision = 'test',
    construction,
  }: { search?: GlobalSearchIndex; revision?: string; construction?: OfflineConstructionSource } = {},
): OfflineReferenceData {
  const id = ++downloads
  const asset = (name: string) => `/assets/reference-${id}-${name}.bin`
  const parts: Record<string, string> = {}
  const core: ReferenceQuery[] = []
  for (const query of queries) {
    const part = referencePart(query.key)
    if (part === null) core.push(query)
    else {
      const address = (parts[part] ??= asset(part))
      storedParts.set(address, [...((storedParts.get(address) as ReferenceQuery[] | undefined) ?? []), query])
    }
  }
  storedParts.set(asset('core'), core)
  storedParts.set(asset('search'), search)
  if (construction) {
    const { rules, ...catalogue } = construction
    storedParts.set(asset('catalogue'), { ...catalogue, editions: [] })
    storedParts.set(asset('rules'), { revision: construction.revision, rules })
  }
  return {
    version: 2,
    savedAt: 1,
    appRevision: 'app',
    editions: [],
    download: {
      revision,
      reference: { core: asset('core'), search: asset('search'), parts },
      construction: { catalogue: asset('catalogue'), rules: asset('rules'), editions: {} },
    },
  }
}
