export type RuntimeData = null | boolean | number | string | RuntimeData[] | { [key: string]: RuntimeData }

export function packRuntimeData(value: unknown): RuntimeData {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Map) return { $praetoriumMap: [...item] }
      if (item instanceof Set) return { $praetoriumSet: [...item] }
      if (item && typeof item === 'object' && ('$praetoriumMap' in item || '$praetoriumSet' in item))
        throw new Error('Reserved saved-data field')
      return item
    }),
  ) as RuntimeData
}

export function unpackRuntimeData<T>(value: RuntimeData): T {
  const restore = (item: RuntimeData): unknown => {
    if (Array.isArray(item)) return item.map(restore)
    if (item && typeof item === 'object') {
      if (Array.isArray(item.$praetoriumMap))
        return new Map(item.$praetoriumMap.map((pair) => (pair as RuntimeData[]).map(restore) as [unknown, unknown]))
      if (Array.isArray(item.$praetoriumSet)) return new Set(item.$praetoriumSet.map(restore))
      return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, restore(child)]))
    }
    return item
  }
  return restore(value) as T
}
