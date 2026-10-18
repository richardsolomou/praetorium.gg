import { jsonByteLength } from '../core/json'

const REFERENCE = '$praetoriumText'
const MAX_TEXTS = 100_000
const MAX_BYTES = 100_000_000

export function isReferenceTexts(texts: unknown): texts is string[] {
  return Array.isArray(texts) && texts.length <= MAX_TEXTS && texts.every((text) => typeof text === 'string')
}

export function shareReferenceText(value: unknown) {
  const counts = new Map<string, number>()
  const visit = (item: unknown, depth = 0): void => {
    if (depth > 64) throw new Error('Reference data is too deeply nested')
    if (typeof item === 'string' && item.length >= 120) {
      counts.set(item, (counts.get(item) ?? 0) + 1)
      if (counts.size > MAX_TEXTS) throw new Error('Reference has too many texts')
    } else if (item && typeof item === 'object') {
      if (REFERENCE in item) throw new Error('Reserved reference-text field')
      for (const child of Object.values(item)) visit(child, depth + 1)
    }
  }
  visit(value)
  const texts = [...counts].filter(([, count]) => count > 1).map(([text]) => text)
  const ids = new Map(texts.map((text, index) => [text, index]))
  const replace = (item: unknown): unknown => {
    if (typeof item === 'string' && ids.has(item)) return { [REFERENCE]: ids.get(item) }
    if (Array.isArray(item)) return item.map(replace)
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, replace(child)]))
    return item
  }
  return { value: replace(value), texts }
}

export function restoreReferenceText(value: unknown, texts: unknown) {
  if (!isReferenceTexts(texts)) throw new Error('Invalid reference texts')
  let remaining = MAX_BYTES - jsonByteLength({ value, texts })
  const restore = (item: unknown, depth = 0): unknown => {
    if (depth > 64) throw new Error('Reference data is too deeply nested')
    if (!item || typeof item !== 'object') return item
    if (REFERENCE in item) {
      const index = (item as Record<string, unknown>)[REFERENCE]
      if (Object.keys(item).length !== 1 || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index >= texts.length)
        throw new Error('Invalid reference text')
      const text: string = texts[index]!
      remaining -= jsonByteLength(text)
      if (remaining < 0) throw new Error('Reference texts exceed the size limit')
      return text
    }
    if (Array.isArray(item)) return item.map((child) => restore(child, depth + 1))
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, restore(child, depth + 1)]))
  }
  if (remaining < 0) throw new Error('Reference texts exceed the size limit')
  return restore(value)
}
