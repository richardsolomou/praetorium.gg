import fs from 'node:fs'
import path from 'node:path'
import { factionDirectories } from './rulesSource'

export type ExternalReference = { namespace: string; id: string }
export type ExternalReferenceEntity = 'units' | 'enhancements' | 'stratagems'

export type ExternalReferenceIndex = {
  byCanonicalId: ReadonlyMap<string, readonly ExternalReference[]>
  canonicalIdsByReference: ReadonlyMap<string, readonly string[]>
}

export type ExternalReferences = Record<ExternalReferenceEntity, ExternalReferenceIndex>

const keyOf = (namespace: string, id: string) => `${namespace}\0${id}`

export function indexExternalReferences(records: readonly unknown[]): ExternalReferenceIndex {
  const byCanonicalId = new Map<string, Map<string, ExternalReference>>()
  const canonicalIdsByReference = new Map<string, Set<string>>()
  for (const value of records) {
    if (!value || typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    if (typeof record.id !== 'string' || !Array.isArray(record.external_refs)) continue
    const references = record.external_refs.flatMap((candidate): ExternalReference[] => {
      if (!candidate || typeof candidate !== 'object') return []
      const reference = candidate as Record<string, unknown>
      return typeof reference.namespace === 'string' && typeof reference.id === 'string'
        ? [{ namespace: reference.namespace, id: reference.id }]
        : []
    })
    const found = byCanonicalId.get(record.id) ?? new Map<string, ExternalReference>()
    for (const reference of references) {
      const key = keyOf(reference.namespace, reference.id)
      found.set(key, reference)
      const canonicalIds = canonicalIdsByReference.get(key) ?? new Set<string>()
      canonicalIds.add(record.id)
      canonicalIdsByReference.set(key, canonicalIds)
    }
    byCanonicalId.set(record.id, found)
  }
  return {
    byCanonicalId: new Map([...byCanonicalId].map(([id, references]) => [id, [...references.values()]])),
    canonicalIdsByReference: new Map([...canonicalIdsByReference].map(([reference, ids]) => [reference, [...ids]])),
  }
}

const emptyIndex = (): ExternalReferenceIndex => ({ byCanonicalId: new Map(), canonicalIdsByReference: new Map() })

export const emptyExternalReferences = (): ExternalReferences => ({
  units: emptyIndex(),
  enhancements: emptyIndex(),
  stratagems: emptyIndex(),
})

export function loadExternalReferences(core: string): ExternalReferences {
  const records: Record<ExternalReferenceEntity, unknown[]> = { units: [], enhancements: [], stratagems: [] }
  if (!fs.existsSync(core)) return emptyExternalReferences()
  for (const faction of factionDirectories(core)) {
    for (const entity of Object.keys(records) as ExternalReferenceEntity[]) {
      const file = path.join(core, faction, `${entity}.json`)
      if (!fs.existsSync(file)) continue
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (Array.isArray(parsed)) records[entity].push(...parsed)
    }
  }
  return {
    units: indexExternalReferences(records.units),
    enhancements: indexExternalReferences(records.enhancements),
    stratagems: indexExternalReferences(records.stratagems),
  }
}

export function canonicalIdsFor(index: ExternalReferenceIndex, namespace: string, id: string): readonly string[] {
  return index.canonicalIdsByReference.get(keyOf(namespace, id)) ?? []
}

export function externalIdsFor(index: ExternalReferenceIndex, canonicalId: string, namespace: string): readonly string[] {
  return (index.byCanonicalId.get(canonicalId) ?? [])
    .filter((reference) => reference.namespace === namespace)
    .map((reference) => reference.id)
}

export function relatedExternalIds(
  index: ExternalReferenceIndex,
  namespace: string,
  id: string,
  relatedNamespace: string,
): readonly string[] {
  return [...new Set(canonicalIdsFor(index, namespace, id).flatMap((canonicalId) => externalIdsFor(index, canonicalId, relatedNamespace)))]
}
