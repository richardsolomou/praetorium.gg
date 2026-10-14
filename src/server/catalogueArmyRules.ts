import fs from 'node:fs'
import path from 'node:path'
import type { CatalogueFile } from '../core/catalogue'
import { routeSlug } from '../core/slug'
import { datacardsFactionKeys, type FactionContent, type LoadedDatacards } from './datacards'
import { joinKey } from '../shared/rulesSource'
import { readSharedJson } from './sharedJson'
import type { Steps } from '../shared/steps'

type RuleText = { name: string; description: string }

export function* missingArmyRulesFromCatalogueSteps(directory: string, datacards: LoadedDatacards): Steps<Map<string, RuleText[]>> {
  const found = new Map<string, RuleText[]>()
  if (!fs.existsSync(directory)) return found
  const leafOf = (name: string) =>
    name
      .split(' - ')
      .at(-1)
      ?.replace(/ Library$| \(11e\)$/g, '') ?? ''
  const catalogues: { name: string; catalogue: NonNullable<CatalogueFile['catalogue']> }[] = []
  for (const file of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const parsed = readSharedJson(path.join(directory, file)) as CatalogueFile
    if (parsed.catalogue) catalogues.push({ name: leafOf(file.slice(0, -5)), catalogue: parsed.catalogue })
    yield
  }
  const contents = new Map<string, Pick<FactionContent, 'name' | 'armyRules' | 'factionAbilityNames'>>(
    [...new Set(datacards.factions.values())].map((content) => [routeSlug(content.name), content]),
  )
  for (const { catalogue } of catalogues) {
    const name = leafOf(catalogue.name)
    if (catalogue.library || [...datacardsFactionKeys(name)].some((key) => datacards.factions.has(key))) continue
    contents.set(routeSlug(name), { name, armyRules: [], factionAbilityNames: new Set() })
  }
  for (const content of contents.values()) {
    const missing = [...content.factionAbilityNames].filter(
      (name) => !content.armyRules.some((rule) => joinKey(name) === joinKey(rule.name)),
    )
    if (!missing.length && content.armyRules.length) continue
    const names = datacardsFactionKeys(content.name)
    const matching = catalogues.flatMap(({ name, catalogue }) =>
      names.has(routeSlug(name)) && names.has(routeSlug(leafOf(catalogue.name))) ? [catalogue] : [],
    )
    if (!content.armyRules.length) {
      const candidates = matching.flatMap((catalogue) =>
        (catalogue.rules ?? []).filter((rule) => !rule.hidden && rule.name && rule.description),
      )
      if (candidates.length === 1 && !missing.some((name) => joinKey(name) === joinKey(candidates[0]!.name!))) {
        found.set(routeSlug(content.name), [{ name: candidates[0]!.name!, description: candidates[0]!.description! }])
      }
    }
    if (!missing.length) continue
    const rules = missing.flatMap((name) => {
      const candidates = matching.flatMap((catalogue) =>
        [...(catalogue.rules ?? []), ...(catalogue.sharedRules ?? [])]
          .filter((rule) => !rule.hidden && rule.name && rule.description && joinKey(name) === joinKey(rule.name))
          .map((rule) => ({ rule, catalogue })),
      )
      if (candidates.length !== 1) return []
      const matched = candidates[0]!
      const related = (matched.catalogue.rules ?? []).filter(
        (rule) =>
          !rule.hidden &&
          rule.name &&
          rule.description &&
          rule.id !== matched.rule.id &&
          rule.description.replaceAll('**', '').toLowerCase().includes(`${name.toLowerCase()} ability`),
      )
      return [
        { name: matched.rule.name!, description: matched.rule.description! },
        ...(related.length === 1 ? [{ name: related[0]!.name!, description: related[0]!.description! }] : []),
      ]
    })
    if (rules.length) found.set(routeSlug(content.name), [...(found.get(routeSlug(content.name)) ?? []), ...rules])
  }
  return found
}
