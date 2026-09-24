import { attachmentOf } from '../core/attach'
import { nameOf } from '../core/catalogue'
import { sameText } from '../core/text'
import type { DatasheetRelationship } from '../core/datasheet'
import { datasheetsOf, referenceDatasheetRoute, type LoadedCatalogue } from './catalogueIndex'
import { isMatchedPlayDatasheet } from './catalogueUnit'

type RelatedDatasheet = { entryId: string; name: string }

const relationshipCache = new WeakMap<LoadedCatalogue, Map<string, { leaders: RelatedDatasheet[]; supporters: RelatedDatasheet[] }>>()

export function relationshipFor(
  loaded: LoadedCatalogue,
  catalogueId: string,
  name: string,
  kind?: DatasheetRelationship['kind'],
  knownEntryId?: string,
): DatasheetRelationship {
  const matches = knownEntryId
    ? [knownEntryId]
    : [...datasheetsOf(loaded.index, catalogueId)].filter((entryId) => {
        const entry = loaded.index.definitions.get(entryId)
        return entry && isMatchedPlayDatasheet(loaded.index, entry) && sameText(nameOf(entry, loaded.index.definitions), name)
      })
  const resolved = matches.length === 1 ? matches[0]! : null
  const entry = resolved ? loaded.index.definitions.get(resolved) : undefined
  return {
    ...(kind ? { kind } : {}),
    name: entry ? nameOf(entry, loaded.index.definitions) : name,
    entryId: resolved,
    route: referenceDatasheetRoute(loaded, name, resolved ? { catalogueId, entryId: resolved } : undefined),
  }
}

export function relationshipsFor(loaded: LoadedCatalogue, catalogueId: string, entryId: string, name: string) {
  const key = `${catalogueId}:${entryId}`
  const cache = relationshipCache.get(loaded)
  const cached = cache?.get(key)
  if (cached) return cached

  const leaders = new Map<string, RelatedDatasheet>()
  const supporters = new Map<string, RelatedDatasheet>()
  for (const candidateId of datasheetsOf(loaded.index, catalogueId)) {
    if (candidateId === entryId) continue
    const candidate = loaded.index.definitions.get(candidateId)
    if (!candidate || !isMatchedPlayDatasheet(loaded.index, candidate)) continue
    const attachment = attachmentOf(candidate, loaded.index)
    if (!attachment?.targets.some((target) => sameText(target, name))) continue
    const found = attachment.kind === 'leader' ? leaders : supporters
    found.set(candidateId, { entryId: candidateId, name: nameOf(candidate, loaded.index.definitions) })
  }
  const relationships = { leaders: [...leaders.values()], supporters: [...supporters.values()] }
  const entries = cache ?? new Map<string, { leaders: RelatedDatasheet[]; supporters: RelatedDatasheet[] }>()
  entries.set(key, relationships)
  if (!cache) relationshipCache.set(loaded, entries)
  return relationships
}
