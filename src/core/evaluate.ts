/**
 * Points and legality for a chosen roster, from the community catalogue data.
 *
 * The whole file is a pure function of (what the player picked, the indexed
 * catalogue). It reads nothing and imports no framework. Two clients holding the
 * same data revision must reach the same numbers, which is why the evaluator has
 * no configuration and no clock.
 *
 * What it does not yet understand it records in `unhandled` rather than guessing:
 * a wrong points total presented confidently is worse than an honest gap.
 */

import type {
  CatalogueIndex,
  Condition,
  ConditionGroup,
  Constraint,
  Cost,
  Definition,
  EntryLink,
  LocalConditionGroup,
  Modifier,
  ModifierGroup,
  Repeat,
} from './catalogue'

/** What the player picked: an entry, group or link id, how many, and what sits under it. */
export type Selection = { id: string; count?: number; selections?: readonly Selection[] }

export type EvaluationError = { entryId: string; entryName: string; message: string }

export type Evaluation = {
  /** Totals per cost type name, so `pts` reads the way the data names it. */
  costs: Record<string, number>
  points: number
  errors: EvaluationError[]
  /** Features this evaluator met and did not act on. Empty is the goal, silence is not. */
  unhandled: string[]
}

const ENTRY_TYPES = new Set(['model', 'unit', 'upgrade', 'model-or-unit'])

type Node = {
  /** The entry or group the selection resolves to, after following any link. */
  target: Definition
  /** Only the root carries this: the catalogue the roster is being built from. */
  catalogueId?: string
  /** The link that brought it in, when one did — it carries its own costs and constraints. */
  link: EntryLink | null
  id: string
  count: number
  parent: Node | null
  children: Node[]
}

class Census {
  private readonly seen = new Set<string>()

  note(what: string) {
    this.seen.add(what)
  }

  get list() {
    return [...this.seen].toSorted()
  }
}

export type EvaluateOptions = {
  /**
   * The catalogue the list is being built from. Chapter-specific pricing asks for
   * it directly — a Blood Angels captain costs five points more than the same
   * entry in another book — so without it those surcharges cannot be applied.
   */
  primaryCatalogueId?: string
  /**
   * The rest of the list, when asking whether something is available.
   *
   * Visibility is a property of the roster, not of an entry: an enhancement is
   * hidden unless the detachment it belongs to has been taken. Asking without the
   * roster present hides every one of them.
   */
  roster?: readonly Selection[]
}

export function evaluate(selections: readonly Selection[], index: CatalogueIndex, options: EvaluateOptions = {}): Evaluation {
  const census = new Census()
  const root: Node = {
    target: { id: 'roster' },
    catalogueId: options.primaryCatalogueId,
    link: null,
    id: 'roster',
    count: 1,
    parent: null,
    children: [],
  }
  root.children = selections.map((selection) => build(selection, root, index, census)).filter((node): node is Node => node !== null)

  const totals = new Map<string, number>()
  const errors: EvaluationError[] = []

  for (const node of descendants(root)) {
    for (const [typeId, value] of costsOf(node, root, index, census)) {
      totals.set(typeId, (totals.get(typeId) ?? 0) + value * node.count)
    }
    errors.push(...violations(node, root, index, census))
  }

  const costs: Record<string, number> = {}
  for (const [typeId, value] of totals) {
    const name = index.costTypes.get(typeId)?.name ?? typeId
    costs[name] = (costs[name] ?? 0) + value
  }

  return { costs, points: totals.get(index.pointsTypeId) ?? 0, errors, unhandled: census.list }
}

/**
 * Whether the data hides this entry from a roster of this kind.
 *
 * Campaign-only content — Crusade honours, relics, battle traits — is marked
 * hidden unless the roster is a Crusade force, and there is a great deal of it
 * hanging off every datasheet. Without asking, a list builder offers a player
 * fourteen choices that have nothing to do with the game they are playing.
 */
export function hiddenByRules(definition: Definition, index: CatalogueIndex, options: EvaluateOptions = {}): boolean {
  const census = new Census()
  const root: Node = {
    target: { id: 'roster' },
    catalogueId: options.primaryCatalogueId,
    link: null,
    id: 'roster',
    count: 1,
    parent: null,
    children: [],
  }
  const link = isLink(definition) ? definition : null
  const target = link ? (index.definitions.get(link.targetId) ?? definition) : definition
  const node: Node = { target, link, id: definition.id, count: 1, parent: root, children: [] }
  // The rest of the list sits alongside, so roster-scoped gates can see it.
  const rest = (options.roster ?? [])
    .map((selection) => build(selection, root, index, census))
    .filter((each): each is Node => each !== null)
  root.children = [...rest, node]

  let hidden = Boolean(definition.hidden || target.hidden)
  for (const modifier of modifiersOf(node)) {
    if (modifier.field !== 'hidden') continue
    if (repeatCount(modifier, node, root, index, census) === 0) continue
    if (modifier.type === 'set') hidden = modifier.value === true
  }
  return hidden
}

function build(selection: Selection, parent: Node, index: CatalogueIndex, census: Census): Node | null {
  const definition = index.definitions.get(selection.id)
  if (!definition) {
    census.note(`unknown selection id ${selection.id}`)
    return null
  }
  const link = isLink(definition) ? definition : null
  const target = link ? index.definitions.get(link.targetId) : definition
  if (!target) {
    census.note(`link ${definition.id} points at missing ${link?.targetId}`)
    return null
  }

  const node: Node = { target, link, id: selection.id, count: selection.count ?? 1, parent, children: [] }
  node.children = (selection.selections ?? [])
    .map((child) => build(child, node, index, census))
    .filter((child): child is Node => child !== null)
  return node
}

const isLink = (definition: Definition): definition is EntryLink => 'targetId' in definition

/** Only entries carry an entry type; a group is the container around them. */
const isGroup = (node: Node) => node.target.type === undefined

/**
 * The selections under a node, with group layers promoted away.
 *
 * A group organises a catalogue; it is not a selection in a roster. A condition
 * counting `model` selections directly under a unit must see the models even
 * though the data nests them in a group, and a condition naming a group counts
 * the selections that came from it — which is what `matches` uses the group chain
 * for. Treating a group as a level of nesting priced every one of these units as
 * if the unit were empty.
 *
 * `deep` follows the data's own `includeChildSelections`: without it, only what
 * sits immediately under the node, groups notwithstanding.
 */
function selectionsUnder(node: Node, deep: boolean): Node[] {
  const found: Node[] = []
  const walk = (current: Node) => {
    for (const child of current.children) {
      if (isGroup(child)) {
        walk(child)
        continue
      }
      found.push(child)
      if (deep) walk(child)
    }
  }
  walk(node)
  return found
}

/** Whether a selection was chosen from a group with this id, however deeply nested the groups are. */
function inGroup(node: Node, groupId: string): boolean {
  for (let parent = node.parent; parent && isGroup(parent); parent = parent.parent) {
    if (parent.target.id === groupId || parent.id === groupId) return true
  }
  return false
}

/** The node's own definitions, target first: a link's constraints and modifiers add to its target's. */
function sourcesOf(node: Node): Definition[] {
  return node.link ? [node.target, node.link] : [node.target]
}

function costsOf(node: Node, root: Node, index: CatalogueIndex, census: Census): Map<string, number> {
  // A link's costs replace its target's for the types it names; everything else carries over.
  const base = new Map<string, number>()
  for (const source of sourcesOf(node)) {
    for (const cost of source.costs ?? []) base.set(cost.typeId, cost.value)
  }

  for (const modifier of modifiersOf(node)) {
    if (!index.costTypes.has(modifier.field)) continue
    const times = repeatCount(modifier, node, root, index, census)
    if (times === 0) continue
    const value = Number(modifier.value)
    if (!Number.isFinite(value)) {
      census.note(`cost modifier ${modifier.type} with non-numeric value`)
      continue
    }
    const current = base.get(modifier.field) ?? 0
    if (modifier.type === 'set') base.set(modifier.field, value)
    else if (modifier.type === 'increment') base.set(modifier.field, current + value * times)
    else if (modifier.type === 'decrement') base.set(modifier.field, current - value * times)
    else if (modifier.type === 'multiply') base.set(modifier.field, current * value ** times)
    else census.note(`cost modifier type ${modifier.type}`)
  }

  return base
}

/** Every modifier that applies to this node, with modifier groups flattened and gated. */
function modifiersOf(node: Node): Modifier[] {
  const collected: Modifier[] = []
  const flatten = (group: ModifierGroup, inherited: ModifierGroup[]) => {
    const chain = [...inherited, group]
    for (const modifier of group.modifiers ?? []) {
      // A group's conditions gate everything inside it, so they become the
      // modifier's own — the modifier is only ever evaluated once, here.
      collected.push({
        ...modifier,
        conditions: [...chain.flatMap((entry) => entry.conditions ?? []), ...(modifier.conditions ?? [])],
        conditionGroups: [...chain.flatMap((entry) => entry.conditionGroups ?? []), ...(modifier.conditionGroups ?? [])],
        repeats: [...chain.flatMap((entry) => entry.repeats ?? []), ...(modifier.repeats ?? [])],
      })
    }
    for (const nested of group.modifierGroups ?? []) flatten(nested, chain)
  }

  for (const source of sourcesOf(node)) {
    collected.push(...(source.modifiers ?? []))
    for (const group of source.modifierGroups ?? []) flatten(group, [])
  }
  return collected
}

/**
 * How many times a modifier applies: zero when its conditions fail, otherwise one,
 * or once per `repeats` of whatever it counts — which is how a per-model cost is written.
 */
function repeatCount(modifier: Modifier, node: Node, root: Node, index: CatalogueIndex, census: Census): number {
  if (!passes(modifier, node, root, index, census)) return 0
  if (!modifier.repeats?.length) return 1
  return modifier.repeats.reduce((total, repeat) => total + repeatTimes(repeat, node, root, index, census), 0)
}

function repeatTimes(repeat: Repeat, node: Node, root: Node, index: CatalogueIndex, census: Census): number {
  const measured = measure(repeat, node, root, index, census)
  const per = repeat.value || 1
  const ratio = measured / per
  const times = repeat.roundUp ? Math.ceil(ratio) : Math.floor(ratio)
  return Math.max(0, times) * (repeat.repeats ?? 1)
}

function passes(
  gated: { conditions?: Condition[]; conditionGroups?: ConditionGroup[] },
  node: Node,
  root: Node,
  index: CatalogueIndex,
  census: Census,
) {
  const conditions = gated.conditions ?? []
  const groups = gated.conditionGroups ?? []
  if (!conditions.length && !groups.length) return true
  return (
    conditions.every((condition) => holds(condition, node, root, index, census)) &&
    groups.every((group) => groupHolds(group, node, root, index, census))
  )
}

function groupHolds(group: ConditionGroup, node: Node, root: Node, index: CatalogueIndex, census: Census): boolean {
  const results = [
    ...(group.conditions ?? []).map((condition) => holds(condition, node, root, index, census)),
    ...(group.conditionGroups ?? []).map((nested) => groupHolds(nested, node, root, index, census)),
    ...(group.localConditionGroups ?? []).map((local) => localHolds(local, node, root, index, census)),
  ]
  // An empty group means its contents were not understood, not that it is
  // satisfied. Failing closed keeps an unparsed gate from adding points.
  if (!results.length) {
    census.note('condition group with nothing readable in it')
    return false
  }
  if (group.type === 'and') return results.every(Boolean)
  if (group.type === 'or') return results.some(Boolean)
  const met = results.filter(Boolean).length
  if (group.type === 'atLeast') return met >= (group.value ?? 1)
  if (group.type === 'atMost') return met <= (group.value ?? 0)
  if (group.type === 'equalTo') return met === (group.value ?? 0)
  census.note(`condition group type ${String(group.type)}`)
  return false
}

/**
 * How many selections in the scope look like the thing the inner conditions
 * describe, compared against a count. Each candidate is judged as if it were the
 * subject, which is what makes "am I the second of these?" expressible.
 */
function localHolds(group: LocalConditionGroup, node: Node, root: Node, index: CatalogueIndex, census: Census): boolean {
  const origins = resolveScope(group.scope, node, root, census)
  if (!origins.length) return false

  const candidates = new Set<Node>()
  for (const origin of origins) {
    for (const candidate of selectionsUnder(origin, group.includeChildSelections === true)) {
      if (matches(candidate, group.childId)) candidates.add(candidate)
    }
  }

  const met = [...candidates].filter((candidate) => passes(group, candidate, root, index, census)).length
  if (group.type === 'atLeast') return met >= (group.value ?? 1)
  if (group.type === 'atMost') return met <= (group.value ?? 0)
  if (group.type === 'equalTo') return met === (group.value ?? 0)
  if (group.type === 'and') return met === candidates.size
  if (group.type === 'or') return met > 0
  census.note(`local condition group type ${String(group.type)}`)
  return false
}

function holds(condition: Condition, node: Node, root: Node, index: CatalogueIndex, census: Census): boolean {
  const measured = measure(condition, node, root, index, census)
  switch (condition.type) {
    case 'atLeast':
      return measured >= condition.value
    case 'atMost':
      return measured <= condition.value
    case 'equalTo':
      return measured === condition.value
    case 'greaterThan':
      return measured > condition.value
    case 'lessThan':
      return measured < condition.value
    case 'instanceOf':
      return measured > 0
    case 'notInstanceOf':
      return measured === 0
    default:
      // `before` and `after` compare where two selections sit in roster order,
      // which is how "a second copy of this costs more" is written. Unproven means
      // false: a gate the evaluator cannot read must never be able to add points.
      census.note(`condition type ${condition.type}`)
      return false
  }
}

type Measurable = {
  field: string
  scope: string
  childId?: string
  includeChildSelections?: boolean
}

/** Counts selections, or sums a cost, within a scope. The heart of every condition and constraint. */
function measure(spec: Measurable, node: Node, root: Node, index: CatalogueIndex, census: Census): number {
  // Not a place in the roster but a question about it: which book is this list from.
  if (spec.scope === 'primary-catalogue') {
    if (!root.catalogueId) {
      census.note('scope primary-catalogue without a catalogue to compare')
      return 0
    }
    return spec.childId === root.catalogueId ? 1 : 0
  }

  const origins = resolveScope(spec.scope, node, root, census)
  if (!origins.length) return 0

  const seen = new Set<Node>()
  for (const origin of origins) {
    for (const candidate of selectionsUnder(origin, spec.includeChildSelections === true)) {
      if (matches(candidate, spec.childId)) seen.add(candidate)
    }
  }
  const matching = [...seen]

  if (spec.field === 'selections') return matching.reduce((total, each) => total + each.count, 0)
  if (index.costTypes.has(spec.field)) {
    return matching.reduce((total, each) => total + (costOf(each, spec.field) ?? 0) * each.count, 0)
  }
  if (spec.field === 'forces') {
    // A force is the detachment a unit sits in. The tracker has no detachments yet,
    // so a force count cannot be answered rather than being answered wrongly.
    census.note('field forces')
    return 0
  }
  census.note(`measured field ${spec.field}`)
  return 0
}

const costOf = (node: Node, typeId: string) =>
  sourcesOf(node)
    .flatMap((source) => source.costs ?? [])
    .find((cost: Cost) => cost.typeId === typeId)?.value

function matches(node: Node, childId: string | undefined): boolean {
  if (!childId || childId === 'any') return true
  if (ENTRY_TYPES.has(childId)) {
    const type = node.target.type
    return childId === 'model-or-unit' ? type === 'model' || type === 'unit' : type === childId
  }
  return node.target.id === childId || node.id === childId || inGroup(node, childId)
}

/**
 * Where a condition looks. An entry id means "me, or the nearest ancestor with
 * that id" — which is how a unit's own modifiers count the models inside it.
 *
 * Returns a list because `ancestor` means every ancestor, not one of them.
 */
function resolveScope(scope: string, node: Node, root: Node, census: Census): Node[] {
  switch (scope) {
    case 'self':
      return [node]
    case 'parent':
      return node.parent ? [node.parent] : []
    case 'roster':
      return [root]
    case 'force':
      // Without detachments a force is the whole roster. Recorded, because it
      // makes a per-detachment limit read as a per-roster one.
      census.note('scope force treated as roster')
      return [root]
    case 'ancestor':
      return ancestors(node)
    case 'root-entry':
      return [rootEntry(node)]
    // The enclosing unit, which is what a per-model cost is nearly always counted in.
    case 'unit':
    case 'unit-self':
    case 'model':
    case 'model-or-unit':
      return enclosing(node, scope === 'model-or-unit' ? ['model', 'unit'] : [scope === 'unit-self' ? 'unit' : scope])
    case 'primary-catalogue':
      census.note('scope primary-catalogue')
      return []
    default: {
      for (let current: Node | null = node; current; current = current.parent) {
        if (current.target.id === scope || current.id === scope) return [current]
      }
      census.note(`unresolved scope ${scope}`)
      return []
    }
  }
}

/** The nearest enclosing selection of one of these entry types, counting the node itself. */
function enclosing(node: Node, types: readonly string[]): Node[] {
  for (let current: Node | null = node; current; current = current.parent) {
    const type = current.target.type
    if (type && types.includes(type)) return [current]
  }
  return []
}

function ancestors(node: Node): Node[] {
  const chain: Node[] = []
  for (let current = node.parent; current; current = current.parent) chain.push(current)
  return chain
}

function rootEntry(node: Node): Node {
  let current = node
  while (current.parent && current.parent.parent) current = current.parent
  return current
}

function violations(node: Node, root: Node, index: CatalogueIndex, census: Census): EvaluationError[] {
  if (node === root) return []
  const errors: EvaluationError[] = []
  const name = node.target.name ?? node.target.id

  for (const constraint of sourcesOf(node).flatMap((source) => source.constraints ?? [])) {
    const limit = constraintValue(constraint, node, root, index, census)
    if (limit < 0) continue
    if (constraint.percentValue) {
      census.note('constraint percentValue')
      continue
    }
    // A constraint on an entry counts that entry within the scope, so what is
    // being counted is the node itself.
    const measured = measure({ ...constraint, childId: node.target.id }, node, root, index, census)
    if (constraint.type === 'min' && measured < limit) {
      errors.push({ entryId: node.target.id, entryName: name, message: `needs at least ${limit}, has ${measured}` })
    }
    if (constraint.type === 'max' && measured > limit) {
      errors.push({ entryId: node.target.id, entryName: name, message: `allows at most ${limit}, has ${measured}` })
    }
  }
  return errors
}

/** A constraint's limit after any modifier aimed at it by id — how points limits change per game size. */
function constraintValue(constraint: Constraint, node: Node, root: Node, index: CatalogueIndex, census: Census): number {
  let value = constraint.value
  for (const modifier of modifiersOf(node)) {
    if (modifier.field !== constraint.id) continue
    const times = repeatCount(modifier, node, root, index, census)
    if (times === 0) continue
    const amount = Number(modifier.value)
    if (!Number.isFinite(amount)) continue
    if (modifier.type === 'set') value = amount
    else if (modifier.type === 'increment') value += amount * times
    else if (modifier.type === 'decrement') value -= amount * times
  }
  return value
}

function descendants(node: Node): Node[] {
  const all: Node[] = [node]
  for (const child of node.children) all.push(...descendants(child))
  return all
}
