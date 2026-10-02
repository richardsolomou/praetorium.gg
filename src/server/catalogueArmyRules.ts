import fs from 'node:fs'
import path from 'node:path'
import type { CatalogueFile } from '../core/catalogue'
import { routeSlug } from '../core/slug'
import { datacardsFactionKeys, type LoadedDatacards } from './datacards'
import { joinKey } from './rulesSource'

export function missingArmyRulesFromCatalogue(directory: string, datacards: LoadedDatacards) {
  const found = new Map<string, { name: string; description: string }[]>()
  if (!fs.existsSync(directory)) return found
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.json'))
  const leafOf = (name: string) =>
    name
      .split(' - ')
      .at(-1)
      ?.replace(/ Library$| \(11e\)$/g, '') ?? ''
  for (const content of new Set(datacards.factions.values())) {
    const missing = [...content.factionAbilityNames].filter(
      (name) => !content.armyRules.some((rule) => joinKey(name) === joinKey(rule.name)),
    )
    if (!missing.length && content.armyRules.length) continue
    const names = datacardsFactionKeys(content.name)
    const catalogues = files.flatMap((file) => {
      if (!names.has(routeSlug(leafOf(file.slice(0, -5))))) return []
      const parsed = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as CatalogueFile
      return parsed.catalogue && names.has(routeSlug(leafOf(parsed.catalogue.name))) ? [parsed.catalogue] : []
    })
    if (!content.armyRules.length) {
      const candidates = catalogues.flatMap((catalogue) =>
        (catalogue.rules ?? []).filter((rule) => !rule.hidden && rule.name && rule.description),
      )
      if (candidates.length === 1 && !missing.some((name) => joinKey(name) === joinKey(candidates[0]!.name!))) {
        found.set(routeSlug(content.name), [{ name: candidates[0]!.name!, description: candidates[0]!.description! }])
      }
    }
    if (!missing.length) continue
    const rules = missing.flatMap((name) => {
      const candidates = catalogues.flatMap((catalogue) =>
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
