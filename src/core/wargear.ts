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
import { isCollective, isRosterToggle, MAX_DEPTH, resolve } from './definitions'
import type { Selection } from './evaluate'

export type Wargear = { name: string; count: number }

export function wargearOf(selection: Selection, index: CatalogueIndex): Wargear[] {
  const found = new Map<string, number>()

  /**
   * `carried` is the number of things holding this one, which is what a per-model
   * count has to be multiplied by. A collective entry is already a total for the
   * whole unit — five blasters stored as five — so it is taken as it stands.
   */
  const walk = (node: Selection, depth: number, carried: number) => {
    for (const child of node.selections ?? []) {
      const definition = index.definitions.get(child.id)
      const kind = definition ? resolve(definition, index).type : undefined
      const own = child.count ?? 1
      const count = definition && isCollective(definition, index) ? own : carried * own
      const grandchildren = child.selections ?? []
      if (kind === 'upgrade' && !grandchildren.length && count > 0) {
        const name = (definition && resolve(definition, index).name) ?? definition?.name
        if (name && !isRosterToggle(name)) found.set(name, (found.get(name) ?? 0) + count)
      }
      if (depth < MAX_DEPTH) walk(child, depth + 1, count)
    }
  }

  walk(selection, 0, 1)
  return [...found].map(([name, count]) => ({ name, count }))
}
