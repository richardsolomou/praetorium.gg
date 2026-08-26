/**
 * What a unit is carrying, as a datasheet would list it: leaf upgrades with how
 * many of each, in the order the data holds them.
 *
 * Only leaves count. An upgrade holding other upgrades is a container the data
 * uses for grouping, and naming it alongside its contents would say the same
 * thing twice — "1x Bolt rifle" under "Ranged weapons" reads as two pieces of
 * wargear when the model has one.
 */

import type { CatalogueIndex } from './catalogue'
import { storesUnitTotal } from './collective'
import { isRosterToggle, resolve } from './definitions'
import type { Selection } from './evaluate'
import { routeSlug } from './slug'

export type Wargear = { name: string; count: number }

/** Whether two names describe the same piece of wargear, including a named mode or aura. */
export function sameWargear(one: string, other: string) {
  return wargearKey(one) === wargearKey(other)
}

export const wargearKey = (name: string) => routeSlug(wargearBaseName(name))

/** The shared name without a profile mode, aura label, or source marker. */
export const wargearBaseName = (name: string) => {
  const trimmed = name.trim()
  const marked = /^[^\p{L}\p{N}]+/u.test(trimmed)
  const unmarked = trimmed.replace(/^[^\p{L}\p{N}]+/u, '')
  const withoutMarkedMode = marked ? unmarked.replace(/\s+-\s+[^-]+$/, '') : unmarked
  return withoutMarkedMode
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLocaleLowerCase()
}

export function wargearOf(selection: Selection, index: CatalogueIndex, carriers = 1): Wargear[] {
  const found = new Map<string, number>()

  /** `carried` multiplies one model's share; a unit total stands as written. */
  const walk = (node: Selection, carried: number) => {
    const parent = index.definitions.get(node.id)
    for (const child of node.selections ?? []) {
      const definition = index.definitions.get(child.id)
      const kind = definition ? resolve(definition, index).type : undefined
      const own = child.count ?? 1
      const count = definition && storesUnitTotal(definition, parent, index) ? own : carried * own
      const grandchildren = child.selections ?? []
      const target = definition && resolve(definition, index)
      // Most upgrades with children are only headings, but a described weapon can
      // also hold another choice. The Overlord's weapon holds its resurrection-orb
      // option, for example; taking the orb must not turn the weapon into a heading.
      const described = Boolean(target?.profiles?.length || target?.infoLinks?.some((link) => link.type === 'profile'))
      if (kind === 'upgrade' && (!grandchildren.length || described) && count > 0) {
        const name = target?.name ?? definition?.name
        if (name && !isRosterToggle(name)) found.set(name, (found.get(name) ?? 0) + count)
      }
      walk(child, count)
    }
  }

  walk(selection, carriers)
  return [...found].map(([name, count]) => ({ name, count }))
}
