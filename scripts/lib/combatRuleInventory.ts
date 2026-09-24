import type { InfoGroup, InfoLink, Profile } from '../../src/core/catalogue'
import type { LoadedCatalogue } from '../../src/server/catalogueIndex'
import { combatKeyword, normalizeCombatKeyword } from '../../src/core/combatKeywords'

export function combatWeaponKeywordInventory(loaded: LoadedCatalogue, factionFilter?: string) {
  const rows = new Map<string, { keyword: string; supported: boolean; sources: string[] }>()
  const profile = (value: Profile, source: string) => {
    if (
      !/^(?:Ranged|Melee) Weapons?$/i.test(value.typeName ?? '') ||
      (factionFilter && !source.toLowerCase().includes(factionFilter.toLowerCase()))
    )
      return
    for (const entry of value.characteristics ?? []) {
      if (!/^keywords$/i.test(entry.name ?? '')) continue
      for (const text of (entry.$text ?? '').split(/[,;]/)) {
        const keyword = normalizeCombatKeyword(text)
        if (!keyword || keyword === '-') continue
        const row = rows.get(keyword) ?? { keyword, supported: Boolean(combatKeyword(keyword)), sources: [] }
        const label = `${source} / ${value.name ?? value.id}`
        if (!row.sources.includes(label)) row.sources.push(label)
        rows.set(keyword, row)
      }
    }
  }
  visitCatalogueProfiles(loaded, profile)
  for (const value of loaded.index.shared.values()) {
    if ('typeName' in value) profile(value, 'Shared catalogue')
    else (value as InfoGroup).profiles?.forEach((entry) => profile(entry, 'Shared catalogue'))
  }
  return [...rows.values()].sort(
    (left, right) => Number(left.supported) - Number(right.supported) || left.keyword.localeCompare(right.keyword),
  )
}

/** Inventory unselected and hidden options too; this is discovery, not roster eligibility. */
export function unselectedCombatRules(loaded: LoadedCatalogue) {
  const rows: { name: string; description: string; source: string }[] = []
  const profile = (value: Profile, source: string) => {
    const description = value.characteristics?.find((entry) => entry.name === 'Description')?.$text
    if (value.typeName === 'Abilities' && value.name && description) rows.push({ name: value.name, description, source })
  }
  visitCatalogueProfiles(loaded, profile)
  for (const rule of loaded.index.rules.values()) {
    const faction = loaded.index.catalogues.get(loaded.index.ruleCatalogueOf.get(rule.id) ?? '')
    if (rule.name && rule.description) rows.push({ name: rule.name, description: rule.description, source: faction?.name ?? 'Core' })
  }
  return rows
}

function visitCatalogueProfiles(loaded: LoadedCatalogue, profile: (value: Profile, source: string) => void) {
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
}
