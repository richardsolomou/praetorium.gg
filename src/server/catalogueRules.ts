import { bracketedRuleReferences, normalizeRuleReference, ruleReferenceKeys } from '../core/ruleReference'
import type { LoadedCatalogue } from './catalogueIndex'

export function rulesReferencedIn(loaded: LoadedCatalogue, texts: readonly (string | null)[]) {
  return rulesNamed(
    loaded,
    texts.flatMap((text) => [
      ...[...(text ?? '').matchAll(/\*\*(.*?)\*\*|\^\^(.*?)\^\^/g)].flatMap((match) => {
        const name = (match[1] ?? match[2] ?? '').replaceAll(/\*\*|\^\^/g, '')
        return name ? [name] : []
      }),
      ...bracketedRuleReferences(text ?? '').filter((name): name is string => Boolean(name)),
    ]),
  )
}

type NamedRule = { name: string; descriptions: Set<string>; order: number }
const ruleNameIndexCache = new WeakMap<LoadedCatalogue, Map<string, NamedRule[]>>()

function ruleNameIndex(loaded: LoadedCatalogue) {
  const cached = ruleNameIndexCache.get(loaded)
  if (cached) return cached
  const index = new Map<string, NamedRule[]>()
  let order = 0
  for (const rule of loaded.index.rules.values()) {
    if (!rule.name || !rule.description) continue
    const key = normalizeRuleReference(rule.name)
    const bucket = index.get(key) ?? []
    if (!index.has(key)) index.set(key, bucket)
    const existing = bucket.find((candidate) => candidate.name === rule.name)
    if (existing) existing.descriptions.add(rule.description)
    else bucket.push({ name: rule.name, descriptions: new Set([rule.description]), order: order++ })
  }
  ruleNameIndexCache.set(loaded, index)
  return index
}

export function rulesNamed(loaded: LoadedCatalogue, names: readonly string[]) {
  const index = ruleNameIndex(loaded)
  const matched = new Set<NamedRule>()
  for (const reference of names) {
    for (const key of ruleReferenceKeys(reference)) {
      for (const candidate of index.get(key) ?? []) matched.add(candidate)
    }
  }
  return [...matched]
    .toSorted((left, right) => left.order - right.order)
    .flatMap(({ name, descriptions }) => (descriptions.size === 1 ? [{ name, description: descriptions.values().next().value! }] : []))
}
