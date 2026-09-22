import type { CatalogueIndex } from './catalogue'
import { resolve } from './definitions'
import type { Selection } from './evaluate'
import { wargearOf, type Wargear } from './wargear'

export type CombatCarrier = { name: string; models: number; weapons: Wargear[] }

/** Preserve model ownership before the datasheet merges equal weapon profiles. */
export function combatCarriers(selection: Selection, index: CatalogueIndex): CombatCarrier[] {
  const found: CombatCarrier[] = []
  const visit = (node: Selection) => {
    if ((node.count ?? 1) <= 0) return
    const definition = index.definitions.get(node.id)
    const target = definition && resolve(definition, index)
    if (target?.type === 'model') {
      found.push({ name: target.name ?? node.id, models: node.count ?? 1, weapons: wargearOf(node, index, node.count ?? 1) })
      return
    }
    node.selections?.forEach(visit)
  }
  visit(selection)
  if (found.length) return found
  const definition = index.definitions.get(selection.id)
  return [{ name: (definition && resolve(definition, index).name) ?? selection.id, models: 1, weapons: wargearOf(selection, index) }]
}
