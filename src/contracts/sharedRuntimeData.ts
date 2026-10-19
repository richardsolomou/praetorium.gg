import { jsonByteLength } from '../core/json'
import type { RuntimeData } from './runtimeData'

const REFERENCE = '$praetoriumBase'

export function shareRuntimeData(value: RuntimeData, base: RuntimeData, path: string[] = []): RuntimeData {
  const validate = (item: RuntimeData, depth: number) => {
    if (depth > 64) throw new Error('Runtime data is too deeply nested')
    if (!item || typeof item !== 'object') return
    if (REFERENCE in item) throw new Error('Reserved shared-data field')
    for (const child of Object.values(item)) validate(child, depth + 1)
  }
  validate(value, path.length)
  return share(value, base, path)
}

function share(value: RuntimeData, base: RuntimeData, path: string[]): RuntimeData {
  if (value && typeof value === 'object') {
    if (base && typeof base === 'object' && JSON.stringify(value) === JSON.stringify(base)) return { [REFERENCE]: path }
    if (Array.isArray(value)) {
      const matches = new Map(
        (Array.isArray(base) ? base : []).flatMap((child, index) =>
          child && typeof child === 'object' ? [[JSON.stringify(child), index] as const] : [],
        ),
      )
      return value.map((child, index) => {
        const matched = child && typeof child === 'object' ? matches.get(JSON.stringify(child)) : undefined
        return matched === undefined
          ? share(child, childOf(base, String(index)), [...path, String(index)])
          : { [REFERENCE]: [...path, String(matched)] }
      })
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, share(child, childOf(base, key), [...path, key])]))
  }
  return value
}

export function restoreRuntimeData(value: RuntimeData, base: RuntimeData, budget = { remaining: 100_000_000 }, depth = 0): RuntimeData {
  if (depth > 64) throw new Error('Runtime data is too deeply nested')
  if (!value || typeof value !== 'object') return value
  if (REFERENCE in value) {
    const path = value[REFERENCE]
    if (Object.keys(value).length !== 1 || !Array.isArray(path) || path.length > 64 || !path.every((key) => typeof key === 'string'))
      throw new Error('Invalid shared runtime data')
    const restored = path.reduce<RuntimeData>((parent, key) => {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw new Error('Missing shared runtime data')
      return childOf(parent, key)
    }, base)
    budget.remaining -= jsonByteLength(restored)
    if (budget.remaining < 0) throw new Error('Shared runtime data exceeds its size limit')
    return restored
  }
  if (Array.isArray(value)) return value.map((child) => restoreRuntimeData(child, base, budget, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreRuntimeData(child, base, budget, depth + 1)]))
}

function childOf(value: RuntimeData, key: string): RuntimeData {
  return value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Record<string, RuntimeData>)[key]! : null
}
