import type { InfoGroup, InfoLink, Profile } from '../src/core/catalogue'
import type { LoadedCatalogue } from '../src/server/catalogueIndex'

/** Inventory unselected and hidden options too; this is discovery, not roster eligibility. */
export function unselectedCombatRules(loaded: LoadedCatalogue) {
  const rows: { name: string; description: string; source: string }[] = []
  const profile = (value: Profile, source: string) => {
    const description = value.characteristics?.find((entry) => entry.name === 'Description')?.$text
    if (value.typeName === 'Abilities' && value.name && description) rows.push({ name: value.name, description, source })
  }
  const links = (values: readonly InfoLink[], source: string, visited: Set<string>) => {
    for (const link of values) {
      if (visited.has(link.targetId)) continue
      visited.add(link.targetId)
      const shared = loaded.index.shared.get(link.targetId)
      if (!shared) continue
      if ('typeName' in shared) profile({ ...shared, name: link.name ?? shared.name }, source)
      else group(shared, source, visited)
    }
  }
  const group = (value: InfoGroup, source: string, visited: Set<string>) => {
    value.profiles?.forEach((entry) => profile(entry, source))
    links(value.infoLinks ?? [], source, visited)
  }
  for (const entry of loaded.index.definitions.values()) {
    const faction = loaded.index.catalogues.get(loaded.index.catalogueOf.get(entry.id) ?? '')
    const source = `${faction?.name ?? 'Catalogue'} / ${entry.name ?? entry.id}`
    entry.profiles?.forEach((value) => profile(value, source))
    const visited = new Set<string>()
    entry.infoGroups?.forEach((value) => group(value, source, visited))
    links(entry.infoLinks ?? [], source, visited)
  }
  for (const rule of loaded.index.rules.values()) {
    const faction = loaded.index.catalogues.get(loaded.index.ruleCatalogueOf.get(rule.id) ?? '')
    if (rule.name && rule.description) rows.push({ name: rule.name, description: rule.description, source: faction?.name ?? 'Core' })
  }
  return rows
}
