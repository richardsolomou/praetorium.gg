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
  return JSON.parse(JSON.stringify(value), (_key, item: unknown) => {
    if (item && typeof item === 'object') {
      if ('$praetoriumMap' in item && Array.isArray(item.$praetoriumMap)) return new Map(item.$praetoriumMap)
      if ('$praetoriumSet' in item && Array.isArray(item.$praetoriumSet)) return new Set(item.$praetoriumSet)
    }
    return item
  }) as T
}
