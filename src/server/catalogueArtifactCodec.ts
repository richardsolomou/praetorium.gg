const COLLECTION = '__praetoriumArtifactCollection'

export function encodeCatalogueArtifact(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current instanceof Map) return { [COLLECTION]: 'map', values: [...current] }
    if (current instanceof Set) return { [COLLECTION]: 'set', values: [...current] }
    return current
  })
}

export function decodeCatalogueArtifact(value: string): unknown {
  const revive = (current: unknown): unknown => {
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index++) current[index] = revive(current[index])
      return current
    }
    if (!current || typeof current !== 'object') return current
    const record = current as Record<string, unknown>
    if (Object.hasOwn(record, COLLECTION)) {
      if (Object.keys(record).length !== 2 || !Array.isArray(record.values)) throw new Error('Invalid catalogue collection')
      const values = revive(record.values) as unknown[]
      if (record[COLLECTION] === 'map') {
        if (!values.every((entry) => Array.isArray(entry) && entry.length === 2)) throw new Error('Invalid catalogue map')
        return new Map(values as [unknown, unknown][])
      }
      if (record[COLLECTION] === 'set') return new Set(values)
      throw new Error('Invalid catalogue collection type')
    }
    for (const key of Object.keys(record)) {
      const original = record[key]
      const converted = revive(original)
      if (converted === original) continue
      if (key === '__proto__')
        Object.defineProperty(record, key, { value: converted, writable: true, enumerable: true, configurable: true })
      else record[key] = converted
    }
    return record
  }
  return revive(JSON.parse(value))
}
