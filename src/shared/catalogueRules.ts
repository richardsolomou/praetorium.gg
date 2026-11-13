import { normalizeRuleReference, ruleReferenceKeys } from '../core/ruleReference'
import type { LoadedCatalogue } from './catalogueIndex'
import { referencesIn } from './textFacts'
import { remember } from '../core/collections'
import { comparableText } from '../core/sourceText'

type RuleSource = {
  index: Pick<LoadedCatalogue['index'], 'rules' | 'textFacts'>
  datacards?: Pick<LoadedCatalogue['datacards'], 'keywordRules'>
}

export function rulesReferencedIn(loaded: RuleSource, texts: readonly (string | null)[]) {
  return rulesNamed(loaded, referencesIn(texts, loaded.index.textFacts))
}

/** A rule's wordings by what they say, so one rule copied into several files is one wording. */
type NamedRule = { name: string; descriptions: Map<string, string>; order: number }
const wording = (description: string) => [comparableText(description), description] as const
const ruleNameIndexCache = new WeakMap<RuleSource, Map<string, NamedRule[]>>()

function ruleNameIndex(loaded: RuleSource) {
  return remember(ruleNameIndexCache, loaded, () => {
    const index = new Map<string, NamedRule[]>()
    let order = 0
    for (const rule of loaded.index.rules.values()) {
      if (!rule.name || !rule.description) continue
      const key = normalizeRuleReference(rule.name)
      const bucket = index.get(key) ?? []
      if (!index.has(key)) index.set(key, bucket)
      const existing = bucket.find((candidate) => candidate.name === rule.name)
      if (existing && !existing.descriptions.has(comparableText(rule.description))) existing.descriptions.set(...wording(rule.description))
      else if (!existing) bucket.push({ name: rule.name, descriptions: new Map([wording(rule.description)]), order: order++ })
    }
    for (const rule of loaded.datacards?.keywordRules ?? []) {
      const key = normalizeRuleReference(rule.name)
      if (!index.has(key)) index.set(key, [{ name: rule.name, descriptions: new Map([wording(rule.description)]), order: order++ }])
    }
    return index
  })
}

export function rulesNamed(loaded: RuleSource, names: readonly string[]) {
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
