/**
 * Whether the one number a selection stores is the unit's total or one model's share.
 *
 * A `collective` weapon under a squad of ten is ten weapons stored as one number, and
 * so is every option of a group that holds a collective one: the group is one capacity
 * the squad divides. Everything else stores what a single model holds, and is counted
 * once for every model holding it. Every reader of a count — the evaluator pricing a
 * selection or scaling a per-model constraint, the expander filling a requirement, the
 * choices offering room, the wargear list adding up pieces — asks this one question here.
 */

import { type CatalogueIndex, type Definition, targetOf } from './catalogue'
import { remember } from './collections'

const resolve = (definition: Definition, index: CatalogueIndex) => targetOf(definition, index.definitions)

// Every count the evaluator reads asks these of a definition, and a loaded catalogue's definitions never change.
const collectiveCache = new WeakMap<CatalogueIndex, WeakMap<Definition, boolean>>()
const collectiveGroupCache = new WeakMap<CatalogueIndex, WeakMap<Definition, boolean>>()

/** The entry itself is marked as storing the unit's total. */
export function isCollective(definition: Definition, index: CatalogueIndex): boolean {
  return remember(
    remember(collectiveCache, index, () => new WeakMap()),
    definition,
    () => {
      const target = resolve(definition, index)
      return Boolean(('collective' in definition && definition.collective) || ('collective' in target && target.collective))
    },
  )
}

/** A group whose options share one squad-wide capacity, because one of them stores the unit's total. */
export function isCollectiveGroup(definition: Definition, index: CatalogueIndex): boolean {
  return remember(
    remember(collectiveGroupCache, index, () => new WeakMap()),
    definition,
    () => {
      const target = resolve(definition, index)
      if (target.type !== undefined) return false
      const children = [
        ...(target.selectionEntries ?? []),
        ...(target.selectionEntryGroups ?? []),
        ...(target.entryLinks ?? []).filter((link) => index.definitions.has(link.targetId)),
      ]
      return children.some((child) => isCollective(child, index))
    },
  )
}

/**
 * Whether a child's stored count is already the unit's total, given the entry or group it
 * sits in. A group holds no count of its own, so it passes its holders' count through.
 */
export function storesUnitTotal(definition: Definition, holder: Definition | undefined, index: CatalogueIndex): boolean {
  if (isCollective(definition, index)) return true
  return resolve(definition, index).type !== undefined && Boolean(holder && isCollectiveGroup(holder, index))
}

/** How many of a child the unit fields: its stored number, once for each holder above it unless that number is already the unit's total. */
export function fieldedCount(
  definition: Definition | undefined,
  holder: Definition | undefined,
  index: CatalogueIndex,
  stored: number,
  holders: number,
): number {
  return definition && storesUnitTotal(definition, holder, index) ? stored : holders * stored
}

/**
 * How many carriers a child's per-model (`@parent`) constraint is counted against: the
 * models holding it when its count is a unit total, one otherwise. A group takes the
 * factor of what it holds, because the constraint is written on the group and meant per
 * model.
 */
export function scaleOf(definition: Definition, holder: Definition | undefined, index: CatalogueIndex, carriers: number): number {
  if (storesUnitTotal(definition, holder, index)) return carriers
  return resolve(definition, index).type === undefined && isCollectiveGroup(definition, index) ? carriers : 1
}
