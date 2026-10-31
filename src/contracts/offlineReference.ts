import { PUBLIC_REFERENCE_QUERIES } from './appSnapshot'
import type { GlobalSearchIndex } from '../core/referenceSearch'
import type { RuntimeData } from './runtimeData'
import type { CatalogueFile } from '../core/catalogue'
import { catalogueEditionSchema, type CatalogueEdition } from '../core/catalogueEdition'
import { catalogueReferencePolicySchema } from '../core/catalogueReferencePolicy'
import { restoreReferenceText, shareReferenceText } from './sharedReferenceText'

export type OfflineConstructionSource = {
  edition?: CatalogueEdition
  datacardExcludedCatalogueIds?: string[]
  version: 1
  revision: string
  files: CatalogueFile[]
  datacards: RuntimeData
  mfm: RuntimeData
  rules: RuntimeData
}

export type OfflineConstructionBase = { base: true; version: 1; revision: string; edition: CatalogueEdition }
/** The current rules' construction data with the other rules versions a device loaded, each sharing its data. */
export type OfflineConstructionData = OfflineConstructionSource & {
  shared?: true
  editions?: (OfflineConstructionSource | OfflineConstructionBase)[]
}
/** The current rules' construction data apart from its rules, which battles read alone. */
export type OfflineConstructionCatalogue = Omit<OfflineConstructionSource, 'rules'> & { editions: OfflineConstructionBase[] }
export type OfflineConstructionRules = Pick<OfflineConstructionSource, 'revision' | 'rules'>

/**
 * The published download as separate gzip JSON parts, so a device stores them compressed and decodes only the parts a
 * page reads. Reference queries outside the core are in `parts` by `referencePart`; construction data has the current
 * rules' catalogue and rules apart, and each other rules version on its own, sharing the current rules' data.
 */
export type OfflineReferenceVersion = {
  revision: string
  reference: { core: string; search: string; parts: Record<string, string> }
  construction: { catalogue: string; rules: string; editions: Record<string, string> }
}
export type OfflineAppVersion = { revision: string; css: string; script: string }

/** What a device saved: the published version whose parts it stores, and the other rules versions it keeps once needed. */
export type OfflineReferenceData = {
  version: 2
  savedAt: number
  appRevision: string
  download: OfflineReferenceVersion
  editions: string[]
}
/** The styles and logo the saved offline application shows, kept apart from its record so the native shell never injects them. */
export type OfflineAssets = { css: string; logo: string }

export type ReferenceQuery = { key: readonly unknown[]; data: unknown }

export const MAX_OFFLINE_BYTES = 100_000_000
/** The most JSON one reference, search or rules part may hold, which bounds what one page read decodes. */
export const MAX_REFERENCE_PART_BYTES = 5_000_000
/** The most JSON a construction catalogue or other rules version may hold; pages decode them only for offline roster work. */
export const MAX_CONSTRUCTION_PART_BYTES = 48_000_000
const MAX_PARTS = 2_000
const MAX_PART_QUERIES = 20_000

const OWN_PARTS = new Set(['faction', 'combat-units', 'reference-changes'])

/** The part holding a reference query, or null for the core most pages read. */
export function referencePart(key: readonly unknown[]): string | null {
  if (key[0] === 'faction-datasheets' || key[0] === 'datasheet-slug' || key[0] === 'detachment-detail')
    return typeof key[1] === 'string' ? `faction:${key[1]}` : null
  if (key[0] === 'terrain-references') return `terrain:${key.slice(2).join(',')}`
  return OWN_PARTS.has(String(key[0])) ? String(key[0]) : null
}

/** Encodes a part's JSON with repeated prose stored once. */
export const encodeReferencePart = (value: unknown) => JSON.stringify(shareReferenceText(value))

export function decodeReferencePart(json: string): unknown {
  const { value, texts } = JSON.parse(json) as { value: unknown; texts: unknown }
  return restoreReferenceText(value, texts)
}

const ASSET = /^\/(?:assets|catalogue-assets\/[a-f0-9]{64})\/(?:reference|construction)-[a-f0-9]{64}\.bin$/
const directoryOf = (asset: string) => asset.slice(0, asset.lastIndexOf('/'))

/** Every asset a published version names. */
export function referenceAssets(version: OfflineReferenceVersion) {
  return [
    version.reference.core,
    version.reference.search,
    ...Object.values(version.reference.parts),
    version.construction.catalogue,
    version.construction.rules,
    ...Object.values(version.construction.editions),
  ]
}

const isAssetMap = (value: unknown, limit: number): value is Record<string, string> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value as object).length <= limit &&
  Object.values(value as object).every((asset) => typeof asset === 'string')

export function isOfflineReferenceVersion(value: unknown): value is OfflineReferenceVersion {
  const version = value as OfflineReferenceVersion | null
  if (
    typeof version?.revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(version.revision) ||
    !version.reference ||
    typeof version.reference !== 'object' ||
    !version.construction ||
    typeof version.construction !== 'object' ||
    !isAssetMap(version.reference.parts, MAX_PARTS) ||
    !isAssetMap(version.construction.editions, 16)
  )
    return false
  const assets = referenceAssets(version)
  return assets.every((asset) => typeof asset === 'string' && ASSET.test(asset) && directoryOf(asset) === directoryOf(assets[0]!))
}

export function isOfflineReferenceData(value: unknown): value is OfflineReferenceData {
  const data = value as OfflineReferenceData | null
  return (
    data?.version === 2 &&
    Number.isFinite(data.savedAt) &&
    typeof data.appRevision === 'string' &&
    isOfflineReferenceVersion(data.download) &&
    Array.isArray(data.editions) &&
    data.editions.every((id) => typeof id === 'string' && Object.hasOwn(data.download.construction.editions, id))
  )
}

export function isReferenceQueries(value: unknown): value is ReferenceQuery[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PART_QUERIES &&
    value.every((entry) => Array.isArray(entry?.key) && PUBLIC_REFERENCE_QUERIES.has(String(entry.key[0])))
  )
}

export function isSearchIndex(value: unknown): value is GlobalSearchIndex {
  return (
    Boolean(value) && ['factions', 'detachments', 'datasheets', 'missions', 'rules'].every((key) => Array.isArray((value as never)[key]))
  )
}

/** Construction data as a device assembles it: the current rules, and any other rules versions sharing their data. */
export function isConstructionData(construction: OfflineConstructionData): boolean {
  return (
    isConstructionSource(construction) &&
    (construction.shared === undefined || (construction as { shared?: unknown }).shared === true) &&
    (construction.editions === undefined ||
      (Array.isArray(construction.editions) &&
        construction.editions.length <= 16 &&
        new Set(construction.editions.map((source) => source?.edition?.id)).size === construction.editions.length &&
        construction.editions.every(
          (edition) =>
            edition !== null &&
            typeof edition === 'object' &&
            ('base' in edition
              ? (edition as { base: unknown }).base === true &&
                edition.version === 1 &&
                typeof edition.revision === 'string' &&
                edition.revision.length > 0
              : isConstructionSource(edition)) &&
            catalogueEditionSchema.safeParse(edition.edition).success,
        )))
  )
}

function isConstructionSource(data: OfflineConstructionSource) {
  return (
    data?.version === 1 &&
    typeof data.revision === 'string' &&
    data.revision.length > 0 &&
    Array.isArray(data.files) &&
    data.files.length <= 1_000 &&
    data.files.every((file) => typeof file === 'object' && file !== null) &&
    data.datacards !== undefined &&
    data.mfm !== undefined &&
    data.rules !== undefined &&
    (data.datacardExcludedCatalogueIds === undefined || catalogueReferencePolicySchema.safeParse(data).success)
  )
}
