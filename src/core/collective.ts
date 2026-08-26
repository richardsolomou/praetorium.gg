/**
 * Whether the one number a selection stores is the unit's total or one model's share.
 *
 * A `collective` weapon under a squad of ten is ten weapons stored as one number, and
 * so is every option of a group that holds a collective one: the group is one capacity
 * the squad divides. Everything else stores what a single model holds, and is counted
 * once for every model holding it. Every reader of a count — the evaluator scaling a
 * per-model constraint, the expander filling a requirement, the choices offering room,
 * the wargear list adding up pieces — asks this one question here.
 */

import { type CatalogueIndex, type Definition, targetOf } from './catalogue'

const resolve = (definition: Definition, index: CatalogueIndex) => targetOf(definition, index.definitions)

/** The entry itself is marked as storing the unit's total. */
export function isCollective(definition: Definition, index: CatalogueIndex): boolean {
  const target = resolve(definition, index)
  return Boolean(('collective' in definition && definition.collective) || ('collective' in target && target.collective))
}

/** A group whose options share one squad-wide capacity, because one of them stores the unit's total. */
export function isCollectiveGroup(definition: Definition, index: CatalogueIndex): boolean {
  const target = resolve(definition, index)
  if (target.type !== undefined) return false
  const children = [
    ...(target.selectionEntries ?? []),
    ...(target.selectionEntryGroups ?? []),
    ...(target.entryLinks ?? []).filter((link) => index.definitions.has(link.targetId)),
  ]
  return children.some((child) => isCollective(child, index))
}

/** Whether a child's stored count is already the unit's total, given the entry or group it sits in. */
export function storesUnitTotal(definition: Definition, holder: Definition | undefined, index: CatalogueIndex): boolean {
  return isCollective(definition, index) || Boolean(holder && isCollectiveGroup(holder, index))
}

/**
 * How many carriers a child's per-model (`@parent`) constraint is counted against: the
 * models holding it when its count is a unit total, one otherwise. A group takes the
 * factor of what it holds, because the constraint is written on the group and meant per
 * model.
 */
export function scaleOf(definition: Definition, index: CatalogueIndex, carriers: number): number {
  if (isCollective(definition, index)) return carriers
  const target = resolve(definition, index)
  if (target.type !== undefined) return 1
  return isCollectiveGroup(definition, index) ? carriers : 1
}
