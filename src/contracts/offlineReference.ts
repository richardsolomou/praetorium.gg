import { jsonByteLength } from '../core/json'
import { PUBLIC_REFERENCE_QUERIES } from './appSnapshot'
import type { GlobalSearchIndex } from '../core/referenceSearch'
import type { RuntimeData } from './runtimeData'
import type { CatalogueFile } from '../core/catalogue'
import { catalogueEditionSchema, type CatalogueEdition } from '../core/catalogueEdition'
import { restoreRuntimeData } from './sharedRuntimeData'
import { catalogueReferencePolicySchema } from '../core/catalogueReferencePolicy'
import { isReferenceTexts, restoreReferenceText } from './sharedReferenceText'

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
export type OfflineConstructionData = OfflineConstructionSource & {
  shared?: true
  texts?: string[]
  editions?: (OfflineConstructionSource | OfflineConstructionBase)[]
}

export type OfflineReferenceData = {
  version: 1
  savedAt: number
  revision: string
  appRevision?: string
  queries: { key: readonly unknown[]; data: unknown }[]
  search: GlobalSearchIndex
  css: string
  logo: string
  construction?: OfflineConstructionData
  /** The published construction download `construction` came from, so an unchanged one is not fetched again. */
  constructionBundle?: string
  /** Whether `construction` holds every rules version, which a device keeps once it has needed them. */
  allRulesVersions?: boolean
}

export const MAX_OFFLINE_BYTES = 100_000_000
export const MAX_OFFLINE_QUERIES = 20_000

export type OfflineReferenceBundle = Pick<OfflineReferenceData, 'version' | 'revision' | 'queries' | 'search' | 'construction'>
/**
 * The published download: the reference, then construction data for the current rules alone or with every other
 * rules version, which a device downloads only while it holds rosters on one of `versions`.
 */
export type OfflineReferenceVersion = {
  revision: string
  bundle: string
  construction: { current: string; complete: string; versions: string[] }
}
export type OfflineAppVersion = { revision: string; css: string; script: string }

export function decodeReferenceBundle(value: unknown): unknown {
  const version = (value as { version?: unknown } | null)?.version
  if (version !== 2 && version !== 3) return value
  if (version === 3 && value && typeof value === 'object' && 'texts' in value) {
    const { texts, construction, ...content } = value as { texts: unknown; construction?: OfflineConstructionData }
    const restored = restoreReferenceText({ content, editions: construction?.editions?.map((source) => source.edition) }, texts) as {
      content: object
      editions?: CatalogueEdition[]
    }
    value = {
      ...restored.content,
      construction: construction
        ? {
            ...construction,
            texts,
            ...(construction.editions
              ? { editions: construction.editions.map((source, index) => ({ ...source, edition: restored.editions![index]! })) }
              : {}),
          }
        : undefined,
    }
  }
  const expanded = { ...(value as OfflineReferenceBundle), version: 1 as const }
  if (!isReferenceBundle(expanded) || (version === 2 && !expanded.construction)) throw new Error('Invalid shared reference bundle')
  if (!expanded.construction) return expanded
  if (version === 3) return { ...expanded, construction: { ...expanded.construction, shared: true } }
  const base = expanded.construction
  const budget = { remaining: MAX_OFFLINE_BYTES - jsonByteLength(value) }
  if (budget.remaining < 0) throw new Error('Shared reference bundle exceeds its size limit')
  return {
    ...expanded,
    construction: {
      ...base,
      editions: base.editions?.map((source) =>
        'base' in source
          ? source
          : {
              ...source,
              files: restoreRuntimeData(
                source.files as unknown as RuntimeData,
                base.files as unknown as RuntimeData,
                budget,
              ) as unknown as CatalogueFile[],
              datacards: restoreRuntimeData(source.datacards, base.datacards, budget),
              mfm: restoreRuntimeData(source.mfm, base.mfm, budget),
              rules: restoreRuntimeData(source.rules, base.rules, budget),
            },
      ),
    },
  }
}

export function isReferenceBundle(value: unknown): value is OfflineReferenceBundle {
  const data = value as OfflineReferenceBundle | null
  return (
    data?.version === 1 &&
    typeof data.revision === 'string' &&
    (data.construction === undefined || isConstructionData(data.construction)) &&
    Array.isArray(data.queries) &&
    data.queries.length <= MAX_OFFLINE_QUERIES &&
    data.queries.every((entry) => Array.isArray(entry?.key) && PUBLIC_REFERENCE_QUERIES.has(String(entry.key[0]))) &&
    data.search &&
    ['factions', 'detachments', 'datasheets', 'missions', 'rules'].every((key) =>
      Array.isArray(data.search[key as keyof typeof data.search]),
    )
  )
}

/** Construction data as a download carries it: the current rules, and any other rules versions sharing their data. */
export function isConstructionData(construction: OfflineConstructionData): boolean {
  return (
    isConstructionSource(construction) &&
    (construction.shared === undefined || (construction as { shared?: unknown }).shared === true) &&
    (construction.texts === undefined || isReferenceTexts(construction.texts)) &&
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
