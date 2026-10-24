import { cachedIn } from '../core/collections'
import { referenceAttachmentOf } from '../core/attach'
import { nameOf } from '../core/catalogue'
import { sameText } from '../core/text'
import type { DatasheetRelationship } from '../core/datasheet'
import { datasheetsOf, referenceDatasheetRoute, type LoadedCatalogue } from './catalogueIndex'
import { isOfferedDatasheet } from './catalogueUnit'

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
        return entry && isOfferedDatasheet(loaded.index, entry, true) && sameText(nameOf(entry, loaded.index.definitions), name)
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
  return cachedIn(relationshipCache, loaded, `${catalogueId}:${entryId}`, () => relationshipsOf(loaded, catalogueId, entryId, name))
}

function relationshipsOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string, name: string) {
  const leaders = new Map<string, RelatedDatasheet>()
  const supporters = new Map<string, RelatedDatasheet>()
  for (const candidateId of datasheetsOf(loaded.index, catalogueId)) {
    if (candidateId === entryId) continue
    const candidate = loaded.index.definitions.get(candidateId)
    if (!candidate || !isOfferedDatasheet(loaded.index, candidate, true)) continue
    const attachment = referenceAttachmentOf(candidate, loaded.index)
    if (!attachment?.targets.some((target) => sameText(target, name))) continue
    const found = attachment.kind === 'leader' ? leaders : supporters
    found.set(candidateId, { entryId: candidateId, name: nameOf(candidate, loaded.index.definitions) })
  }
  return { leaders: [...leaders.values()], supporters: [...supporters.values()] }
}
