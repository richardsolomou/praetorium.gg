const COLLECTION = '__praetoriumArtifactCollection'

export function encodeCatalogueArtifact(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current instanceof Map) return { [COLLECTION]: 'map', values: [...current] }
    if (current instanceof Set) return { [COLLECTION]: 'set', values: [...current] }
    return current
  })
}

export function decodeCatalogueArtifact(value: string): unknown {
  return JSON.parse(value, (_key, current: unknown) => {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !(COLLECTION in current)) return current
    const collection = current as Record<string, unknown>
    if (Object.keys(collection).length !== 2 || !Array.isArray(collection.values)) throw new Error('Invalid catalogue collection')
    if (collection[COLLECTION] === 'map') {
      if (!collection.values.every((entry) => Array.isArray(entry) && entry.length === 2)) {
        throw new Error('Invalid catalogue map')
      }
      return new Map(collection.values as [unknown, unknown][])
    }
    if (collection[COLLECTION] === 'set') return new Set(collection.values)
    throw new Error('Invalid catalogue collection type')
  })
}
