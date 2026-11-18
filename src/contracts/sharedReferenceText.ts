import { hasTextTokens } from '../core/sourceText'

const REFERENCE = '$praetoriumText'
const MAX_TEXTS = 100_000
const MAX_LENGTH = 100_000_000

function isReferenceTexts(texts: unknown): texts is string[] {
  return Array.isArray(texts) && texts.length <= MAX_TEXTS && texts.every((text) => typeof text === 'string')
}

export function shareReferenceText(value: unknown) {
  const counts = new Map<string, number>()
  const visit = (item: unknown, depth = 0): void => {
    if (depth > 64) throw new Error('Reference data is too deeply nested')
    if (typeof item === 'string' && (item.length >= 120 || hasTextTokens(item))) {
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

/**
 * Puts each shared text back where it was taken from, rewriting `value` in place: it is the freshly parsed part, and
 * copying every object of a whole faction costs a phone more than the parse itself. `size` is the length of the JSON
 * `value` and `texts` were parsed from, which a caller holding that JSON passes rather than having it encoded again.
 */
export function restoreReferenceText(value: unknown, texts: unknown, size = JSON.stringify({ value, texts }).length) {
  if (!isReferenceTexts(texts)) throw new Error('Invalid reference texts')
  // Bounds what the shared texts expand to, in string length, which is what they occupy once restored.
  let remaining = MAX_LENGTH - size
  const restore = (item: unknown, depth: number): unknown => {
    if (depth > 64) throw new Error('Reference data is too deeply nested')
    if (!item || typeof item !== 'object') return item
    if (REFERENCE in item) {
      const index = (item as Record<string, unknown>)[REFERENCE]
      if (Object.keys(item).length !== 1 || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index >= texts.length)
        throw new Error('Invalid reference text')
      const text: string = texts[index]!
      remaining -= text.length
      if (remaining < 0) throw new Error('Reference texts exceed the size limit')
      return text
    }
    if (Array.isArray(item)) for (let at = 0; at < item.length; at++) item[at] = restore(item[at], depth + 1)
    else for (const key in item) (item as Record<string, unknown>)[key] = restore((item as Record<string, unknown>)[key], depth + 1)
    return item
  }
  if (remaining < 0) throw new Error('Reference texts exceed the size limit')
  return restore(value, 0)
}
