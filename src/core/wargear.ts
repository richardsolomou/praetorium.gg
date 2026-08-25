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
import { isCollective, isCollectiveGroup, isRosterToggle, resolve } from './definitions'
import type { Selection } from './evaluate'

export type Wargear = { name: string; count: number }

export function wargearOf(selection: Selection, index: CatalogueIndex): Wargear[] {
  const found = new Map<string, number>()

  /**
   * `carried` multiplies per-model counts. Collective entries and their sibling
   * options store unit totals, so their own counts stand as written.
   */
  const walk = (node: Selection, carried: number) => {
    const parent = index.definitions.get(node.id)
    const collectiveGroup = parent ? isCollectiveGroup(parent, index) : false
    for (const child of node.selections ?? []) {
      const definition = index.definitions.get(child.id)
      const kind = definition ? resolve(definition, index).type : undefined
      const own = child.count ?? 1
      const count = definition && (collectiveGroup || isCollective(definition, index)) ? own : carried * own
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

  walk(selection, 1)
  return [...found].map(([name, count]) => ({ name, count }))
}
