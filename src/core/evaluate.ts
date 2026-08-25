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
  InfoLink,
  LocalConditionGroup,
  Modifier,
  ModifierGroup,
  Repeat,
} from './catalogue'

/** What the player picked: an entry, group or link id, how many, and what sits under it. */
export type Selection = { id: string; count?: number; selections?: readonly Selection[] }

export type EvaluationError = { entryId: string; entryName: string; message: string }

type Evaluation = {
  /** Totals per cost type name, so `pts` reads the way the data names it. */
  costs: Record<string, number>
  points: number
  selectionPoints: number[][]
  errors: EvaluationError[]
  /** Features this evaluator met and did not act on. Empty is the goal, silence is not. */
  unhandled: string[]
}

const ENTRY_TYPES = new Set(['model', 'unit', 'upgrade', 'model-or-unit'])

type Node = {
  /** The entry or group the selection resolves to, after following any link. */
  target: Definition
  /** Position in the list, in the order it was written. `before` and `after` need it. */
  order: number
  /** Only the root carries this: the catalogue the roster is being built from. */
  catalogueId?: string
  /** Set on the node standing for the roster's force, which conditions scope to. */
  force?: boolean
  /** Only the root carries this: the keywords the data grants and withdraws across the whole tree. */
  grants?: Map<Node, Map<string, boolean>>
  /*
   * Answers kept because every pass over the tree asks for them again, and a tree
   * is finished being built before anything reads it. Anything that came to add a
   * child after evaluation had begun would have to clear these.
   */
  /** Its modifiers, with modifier groups flattened. */
  modifiers?: Modifier[]
  /** The selections under it, shallow at 0 and deep at 1. */
  under?: [Node[] | undefined, Node[] | undefined]
  /** The link that brought it in, when one did — it carries its own costs and constraints. */
  link: EntryLink | null
  id: string
  count: number
  parent: Node | null
  children: Node[]
}

class Census {
  private readonly seen = new Set<string>()

  constructor(readonly associations = 0) {}

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

export type ProfileModifier = {
  originIds: string[]
  filters: string[]
  includeSelf: boolean
  includeEntries: boolean
  recursive: boolean
  global: boolean
  profileType: string
  field: string
  type: Modifier['type']
  value?: unknown
  arg?: string
  position?: number | string
  join?: string
  skipIfPresent?: string
  times: number
  source: string
}

/** Applicable catalogue modifiers that change profiles displayed for one selected unit. */
export function profileModifiers(
  selections: readonly Selection[],
  unitId: string,
  index: CatalogueIndex,
  options: EvaluateOptions = {},
  unitSelectionIndex?: number,
  /**
   * The other units that count as this one, by position.
   *
   * A character attached to a bodyguard unit makes one unit with it, so a relic that
   * speaks of the bearer's unit reaches the models it has joined. Only the whole-unit
   * modifiers travel: what the bearer's own weapons do stays with the bearer.
   */
  companionIndexes: readonly number[] = [],
): ProfileModifier[] {
  const census = new Census(companionIndexes.length)
  const { root, forces } = rosterContext([selections], index, census, options)
  const force = forces[0]
  if (!force) return []

  const indexed = unitSelectionIndex === undefined ? undefined : force.children[unitSelectionIndex]
  const unit =
    indexed && (indexed.id === unitId || indexed.target.id === unitId)
      ? indexed
      : descendants(force).find((node) => node.id === unitId || node.target.id === unitId)
  if (!unit) return []
  // A condition names the shared entry it is about, and a selection reaches that
  // entry through a link with an id of its own. Both are the same thing, so a
  // modifier can be credited to the enhancement rather than to the datasheet.
  const selectedIds = new Set(descendants(root).flatMap((node) => [node.id, node.target.id]))
  const own = new Set(descendants(unit))
  const companions = companionIndexes.flatMap((at) => {
    const node = force.children[at]
    return node && node !== unit ? descendants(node) : []
  })
  const unitNodes = new Set([...own, ...companions])
  const found = new Map<string, ProfileModifier>()

  const add = (node: Node, modifier: Modifier, exact?: { id: string; type: string }) => {
    if (!isProfileModifierType(modifier.type)) return
    const times = repeatCount(modifier, node, root, index, census)
    if (times === 0) return
    const source = (modifier.conditions ?? [])
      .flatMap((condition) => {
        if (!condition.childId || !selectedIds.has(condition.childId)) return []
        const definition = index.definitions.get(condition.childId)
        return definition?.name ? [definition.name] : []
      })
      .at(0)
    const label = source ?? node.target.name ?? node.link?.name ?? 'Catalogue modifier'
    const common = {
      field: modifier.field,
      type: modifier.type,
      value: modifier.value,
      arg: modifier.arg,
      position: modifier.position,
      join: modifier.join,
      skipIfPresent: modifier.skipIfPresent,
      times,
      source: label,
    }

    if (exact) {
      const applied: ProfileModifier = {
        ...common,
        originIds: [],
        filters: [exact.id, node.id],
        includeSelf: true,
        includeEntries: false,
        recursive: false,
        global: true,
        profileType: exact.type,
      }
      found.set(JSON.stringify(applied), applied)
      return
    }

    const affects = modifier.affects
    const profileType = affects?.match(/(?:^|\.)profiles\.([^.]*)$/)?.[1]
    if (!profileType) return
    const target = parseProfileAffects(affects)
    for (const origin of resolveScope(modifier.scope ?? 'self', node, root, index, census)) {
      if (!target.forces && origin !== root && !origin.force && !unitNodes.has(origin)) continue
      const applied: ProfileModifier = {
        ...common,
        originIds: [...new Set([origin.id, origin.target.id])],
        filters: target.filters,
        includeSelf: target.includeSelf,
        includeEntries: target.includeEntries,
        recursive: target.recursive,
        // A whole-unit modifier from the unit this one is attached to belongs to
        // every model here, which is what being one unit means.
        global:
          target.forces ||
          origin === root ||
          Boolean(origin.force) ||
          (target.group && !own.has(origin)) ||
          (origin.target.type === 'model' && target.includeEntries && target.recursive && profileType === 'Unit'),
        profileType,
      }
      found.set(JSON.stringify(applied), applied)
    }
  }

  for (const node of descendants(root)) {
    for (const modifier of modifiersOf(node)) add(node, modifier)
    if (!unitNodes.has(node)) continue
    for (const source of sourcesOf(node)) {
      for (const profile of source.profiles ?? []) {
        if (!profile.typeName) continue
        for (const modifier of flattenedModifiers([profile])) {
          add(node, modifier, modifier.affects ? undefined : { id: profile.id, type: profile.typeName })
        }
      }
      for (const link of source.infoLinks ?? []) {
        if (link.type !== 'profile') continue
        const profile = index.shared.get(link.targetId)
        if (!profile || !('characteristics' in profile) || !profile.typeName) continue
        for (const modifier of flattenedModifiers([profile, link])) {
          add(node, modifier, modifier.affects ? undefined : { id: link.id, type: profile.typeName })
        }
      }
    }
  }
  return [...found.values()]
}

function flattenedModifiers(sources: readonly { modifiers?: Modifier[]; modifierGroups?: ModifierGroup[] }[]) {
  const collected: Modifier[] = []
  const flatten = (group: ModifierGroup, inherited: ModifierGroup[]) => {
    const chain = [...inherited, group]
    for (const modifier of group.modifiers ?? []) {
      collected.push({
        ...modifier,
        conditions: [...chain.flatMap((entry) => entry.conditions ?? []), ...(modifier.conditions ?? [])],
        conditionGroups: [...chain.flatMap((entry) => entry.conditionGroups ?? []), ...(modifier.conditionGroups ?? [])],
        repeats: [...chain.flatMap((entry) => entry.repeats ?? []), ...(modifier.repeats ?? [])],
      })
    }
    for (const nested of group.modifierGroups ?? []) flatten(nested, chain)
  }
  for (const source of sources) {
    collected.push(...(source.modifiers ?? []))
    for (const group of source.modifierGroups ?? []) flatten(group, [])
  }
  return collected
}

const PROFILE_MODIFIER_TYPES = new Set<Modifier['type']>([
  'set',
  'increment',
  'decrement',
  'multiply',
  'divide',
  'modulo',
  'power',
  'exponent',
  'triangular',
  'cumulative-add',
  'cumulative-power',
  'cumulative-multiply',
  'append',
  'prepend',
  'floor',
  'ceil',
  'replace',
])

const isProfileModifierType = (type: Modifier['type']) => PROFILE_MODIFIER_TYPES.has(type)

const AFFECTS_CONTROLS = new Set(['self', 'entries', 'forces', 'recursive', 'group'])

function parseProfileAffects(affects: string) {
  const path = affects.split('.')
  const profile = path.indexOf('profiles')
  return parseAffects(profile < 0 ? [] : path.slice(0, profile))
}

/**
 * Which selections a modifier reaches. The path names the way down — `self`, the
 * `entries` under it, `recursive` for all of them — and anything left over is an id
 * the reached selection has to match. A profile modifier spends the tail of the
 * same path naming profiles; one aimed at a keyword has no tail.
 */
function parseAffects(selection: readonly string[]) {
  const includeEntries = selection.includes('entries')
  const forces = selection.includes('forces')
  return {
    includeSelf: selection.includes('self') || (!includeEntries && !forces),
    includeEntries,
    recursive: selection.includes('recursive'),
    forces,
    // The whole group the modifier sits in, which for wargear on a model is the unit
    // it belongs to. A Destroyer Ankh adds to the Move of every model in the bearer's
    // unit and to the Attacks of only the bearer's own melee weapons, and this is the
    // difference the data draws between the two.
    group: selection.includes('group'),
    filters: selection.filter((part) => !AFFECTS_CONTROLS.has(part)),
  }
}

/**
 * The roster, and the forces its selections sit in.
 *
 * A force sits between the roster and its selections. Conditions count forces and
 * scope to them — a per-detachment limit is written against the force, not the
 * roster — so there has to be one. It is transparent when counting selections,
 * exactly as a group is, so nothing that already worked sees a new layer.
 */
function rosterContext(
  forces: readonly (readonly Selection[])[],
  index: CatalogueIndex,
  census: Census,
  options: EvaluateOptions,
): { root: Node; forces: Node[] } {
  const counter = { next: 0 }
  const root: Node = {
    target: { id: 'roster' },
    order: counter.next++,
    catalogueId: options.primaryCatalogueId,
    link: null,
    id: 'roster',
    count: 1,
    parent: null,
    children: [],
  }
  root.children = forces.map((selections, forceIndex) => {
    const force: Node = {
      target: { id: index.forces[0]?.id ?? 'force', name: index.forces[0]?.name ?? 'Army Roster' },
      order: counter.next++,
      force: true,
      link: null,
      id: `force-${forceIndex}`,
      count: 1,
      parent: root,
      children: [],
    }
    force.children = selections
      .map((selection) => build(selection, force, index, census, counter))
      .filter((node): node is Node => node !== null)
    return force
  })
  return { root, forces: root.children }
}

export function evaluate(selections: readonly Selection[], index: CatalogueIndex, options: EvaluateOptions = {}): Evaluation {
  return evaluateForces([selections], index, options)
}

/**
 * The keywords one of a roster's selections carries, by category id.
 *
 * Not the same question as reading its category links: the data hands keywords out
 * and takes them away conditionally — a Chaplain in Terminator Armour is DEATHWING
 * only in the Dark Angels book — and the condition is about the surroundings, so
 * the selection has to be read where it sits rather than on its own.
 */
export function keywordIds(selections: readonly Selection[], at: number, index: CatalogueIndex, options: EvaluateOptions = {}): string[] {
  const wanted = selections[at]
  if (!wanted) return []
  const census = new Census()
  const { root, forces } = rosterContext([selections], index, census, options)
  // A selection the catalogue cannot resolve is dropped, so the position asked for
  // is not always the position built. The id is what the caller meant.
  const built = forces[0]?.children ?? []
  const positioned = built[at]
  const node = positioned?.id === wanted.id ? positioned : built.find((child) => child.id === wanted.id)
  if (!node) return []
  const held = linkedCategories(node)
  for (const [categoryId, present] of grantsOf(root, index, census).get(node) ?? []) {
    if (present) held.add(categoryId)
    else held.delete(categoryId)
  }
  return [...held]
}

/** Evaluate each force independently while retaining roster-scoped conditions across all of them. */
export function evaluateForces(
  forces: readonly (readonly Selection[])[],
  index: CatalogueIndex,
  options: EvaluateOptions = {},
): Evaluation {
  const census = new Census()
  const { root, forces: builtForces } = rosterContext(forces, index, census, options)
  // Read up front rather than on the first question about a keyword, so a list that
  // asks none still reports the keyword rules this evaluator did not act on.
  grantsOf(root, index, census)

  const totals = new Map<string, number>()
  const selectionPoints = builtForces.map((force) => force.children.map(() => 0))
  const positions = new Map<Node, [number, number]>()
  builtForces.forEach((force, forceAt) =>
    force.children.forEach((selection, selectionAt) => positions.set(selection, [forceAt, selectionAt])),
  )
  const errors: EvaluationError[] = []

  for (const node of descendants(root)) {
    for (const [typeId, value] of costsOf(node, root, index, census)) {
      const amount = value * node.count
      totals.set(typeId, (totals.get(typeId) ?? 0) + amount)
      if (typeId === index.pointsTypeId) {
        let selection: Node | null = node
        while (selection?.parent && !selection.parent.force) selection = selection.parent
        const position = selection && positions.get(selection)
        if (position) selectionPoints[position[0]]![position[1]]! += amount
      }
    }
    errors.push(...violations(node, root, index, census))
    errors.push(...modifierErrors(node, root, index, census))
  }

  const costs: Record<string, number> = {}
  for (const [typeId, value] of totals) {
    const name = index.costTypes.get(typeId)?.name ?? typeId
    costs[name] = (costs[name] ?? 0) + value
  }

  return { costs, points: totals.get(index.pointsTypeId) ?? 0, selectionPoints, errors, unhandled: census.list }
}

function modifierErrors(node: Node, root: Node, index: CatalogueIndex, census: Census): EvaluationError[] {
  if (node === root) return []
  const name = node.target.name ?? node.target.id
  return modifiersOf(node).flatMap((modifier) => {
    if (modifier.field !== 'error' || repeatCount(modifier, node, root, index, census) === 0) return []
    if (modifier.type !== 'add' || typeof modifier.value !== 'string') {
      census.note(`error modifier ${modifier.type} without text`)
      return []
    }
    return [{ entryId: node.target.id, entryName: name, message: modifier.value.replaceAll('{this}', name) }]
  })
}

/**
 * Whether the data hides this entry from a roster of this kind.
 *
 * Campaign-only content — Crusade honours, relics, battle traits — is marked
 * hidden unless the roster is a Crusade force, and there is a great deal of it
 * hanging off every datasheet. Without asking, a list builder offers a player
 * fourteen choices that have nothing to do with the game they are playing.
 *
 * The candidate is judged beside the roster rather than inside its own unit, which
 * is enough for the gates that matter — they ask about the roster and about the
 * keywords of what holds them, and the holder is in the roster. A gate written
 * against `parent` or `self` would need the candidate placed properly first.
 */
export function hiddenByRules(definition: Definition, index: CatalogueIndex, options: EvaluateOptions = {}): boolean {
  const census = new Census()
  const { root, node } = candidateContext(definition, index, options, census)

  let hidden = Boolean(definition.hidden || node.target.hidden)
  for (const modifier of modifiersOf(node)) {
    if (modifier.field !== 'hidden') continue
    if (repeatCount(modifier, node, root, index, census) === 0) continue
    if (modifier.type === 'set') hidden = modifier.value === true
  }
  return hidden
}

/** Whether a display-only rule link is hidden in the current roster context. */
export function infoLinkHiddenByRules(link: InfoLink, index: CatalogueIndex, options: EvaluateOptions = {}): boolean {
  return hiddenByRules(
    {
      id: link.id,
      hidden: link.hidden,
      modifiers: link.modifiers,
      modifierGroups: link.modifierGroups,
    },
    index,
    options,
  )
}

/** Selection-count bounds after roster-dependent modifiers have been applied. */
export function selectionCountBounds(
  definition: Definition,
  index: CatalogueIndex,
  options: EvaluateOptions = {},
): { minimum: number; maximum: number | null } {
  const census = new Census()
  const { root, node } = candidateContext(definition, index, options, census)
  let minimum = 0
  let maximum: number | null = null

  for (const constraint of sourcesOf(node).flatMap((source) => source.constraints ?? [])) {
    if (constraint.field !== 'selections') continue
    const value = constraintValue(constraint, node, root, index, census)
    if (constraint.type === 'min' && (constraint.scope === 'parent' || constraint.scope === 'self')) {
      minimum = Math.max(minimum, value)
    }
    if (constraint.type === 'max' && value >= 0) maximum = maximum === null ? value : Math.min(maximum, value)
  }
  return { minimum, maximum }
}

/**
 * How many of one datasheet a roster may hold, or null when nothing limits it.
 *
 * The number is in the data but not as a number: a roster-scoped `max` constraint
 * carries the Strike Force figure, and a modifier aimed at that constraint's id
 * lowers it for a smaller game. So it is read the same way legality reads it —
 * through `constraintValue`, with the rest of the list present, because the
 * modifier's condition is usually about the roster.
 *
 * Nothing here refuses anything. It is what lets the picker say "3 in roster" and
 * offer to hide what is already full; `violations` remains the only authority on
 * whether a list is legal.
 */
export function rosterLimit(definition: Definition, index: CatalogueIndex, options: EvaluateOptions = {}): number | null {
  const census = new Census()
  const { root, node } = candidateContext(definition, index, options, census)
  const target = node.target

  let limit: number | null = null
  const consider = (constraint: Constraint, extra: readonly Modifier[] = []) => {
    if (constraint.type !== 'max') return
    if (constraint.scope !== 'roster' && constraint.scope !== 'force') return
    if (constraint.field !== 'selections') return
    const value = constraintValue(constraint, node, root, index, census, extra)
    // A negative maximum is how the data says "no cap".
    if (value < 0) return
    limit = limit === null ? value : Math.min(limit, value)
  }

  for (const constraint of sourcesOf(node).flatMap((source) => source.constraints ?? [])) consider(constraint)
  /*
   * Most of the caps are here rather than on the datasheet: every unit carries a
   * category named after itself, and the number sits on that. Without reading them
   * the answer for a battleline squad is "no limit stated", which is wrong and
   * useless in the same breath.
   */
  for (const categoryLink of [...(target.categoryLinks ?? []), ...(definition.categoryLinks ?? [])]) {
    const category = index.categories.get(categoryLink.targetId)
    if (!category) continue
    const extra = [...(category.modifiers ?? []), ...(category.modifierGroups ?? []).flatMap((group) => group.modifiers ?? [])]
    for (const constraint of category.constraints ?? []) consider(constraint, extra)
  }
  return limit
}

function candidateContext(definition: Definition, index: CatalogueIndex, options: EvaluateOptions, census: Census) {
  const counter = { next: 0 }
  const root: Node = {
    target: { id: 'roster' },
    order: counter.next++,
    catalogueId: options.primaryCatalogueId,
    link: null,
    id: 'roster',
    count: 1,
    parent: null,
    children: [],
  }
  const link = isLink(definition) ? definition : null
  const target = link ? (index.definitions.get(link.targetId) ?? definition) : definition
  root.children = (options.roster ?? [])
    .map((selection) => build(selection, root, index, census, counter))
    .filter((each): each is Node => each !== null)
  const node: Node = { target, order: counter.next++, link, id: definition.id, count: 1, parent: root, children: [] }
  root.children = [...root.children, node]
  return { root, node }
}

function build(selection: Selection, parent: Node, index: CatalogueIndex, census: Census, counter: { next: number }): Node | null {
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

  const node: Node = { target, order: counter.next++, link, id: selection.id, count: selection.count ?? 1, parent, children: [] }
  node.children = (selection.selections ?? [])
    .map((child) => build(child, node, index, census, counter))
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
  const cached = node.under?.[deep ? 1 : 0]
  if (cached) return cached
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
  node.under ??= [undefined, undefined]
  node.under[deep ? 1 : 0] = found
  return found
}

/** The forces at or under a node. A roster has one; the shape allows more. */
function forcesUnder(node: Node): Node[] {
  const found = node.force ? [node] : []
  for (const child of node.children) found.push(...forcesUnder(child))
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

  const modifiers = modifiersOf(node).toSorted((left, right) => Number(right.type === 'set') - Number(left.type === 'set'))
  for (const modifier of modifiers) {
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
    else if (modifier.type === 'divide') base.set(modifier.field, value === 0 ? 0 : current / value ** times)
    else census.note(`cost modifier type ${modifier.type}`)
  }

  return base
}

/** Every modifier that applies to this node, with modifier groups flattened and gated. */
function modifiersOf(node: Node): Modifier[] {
  if (node.modifiers) return node.modifiers
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
  node.modifiers = collected
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

/**
 * `subject` is the selection a question is being asked *about*, which is not always
 * the node being examined: a local condition group judges every candidate in a scope
 * against the one being priced, and `before` means nothing without both.
 */
function passes(
  gated: { conditions?: Condition[]; conditionGroups?: ConditionGroup[] },
  node: Node,
  root: Node,
  index: CatalogueIndex,
  census: Census,
  subject: Node = node,
) {
  const conditions = gated.conditions ?? []
  const groups = gated.conditionGroups ?? []
  if (!conditions.length && !groups.length) return true
  return (
    conditions.every((condition) => holds(condition, node, root, index, census, subject)) &&
    groups.every((group) => groupHolds(group, node, root, index, census, subject))
  )
}

function groupHolds(group: ConditionGroup, node: Node, root: Node, index: CatalogueIndex, census: Census, subject: Node = node): boolean {
  const results = [
    ...(group.conditions ?? []).map((condition) => holds(condition, node, root, index, census, subject)),
    ...(group.conditionGroups ?? []).map((nested) => groupHolds(nested, node, root, index, census, subject)),
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
  if (group.type === 'count') {
    if (group.min === undefined && group.max === undefined) {
      census.note('count condition group without bounds')
      return false
    }
    return met >= (group.min ?? 0) && met <= (group.max ?? Number.POSITIVE_INFINITY)
  }
  census.note(`condition group type ${String(group.type)}`)
  return false
}

/**
 * How many selections in the scope look like the thing the inner conditions
 * describe, compared against a count. Each candidate is judged as if it were the
 * subject, which is what makes "am I the second of these?" expressible.
 */
function localHolds(group: LocalConditionGroup, node: Node, root: Node, index: CatalogueIndex, census: Census): boolean {
  const origins =
    group.scope === 'parent' && group.includeChildForces && node.parent?.force
      ? [node.parent]
      : resolveScope(group.scope, node, root, index, census)
  if (!origins.length) return false

  const candidates = new Set<Node>()
  for (const origin of origins) {
    for (const candidate of selectionsUnder(origin, group.includeChildSelections === true)) {
      if (matches(candidate, group.childId, root, index, census)) candidates.add(candidate)
    }
  }

  // Each candidate is judged against the node being priced, which is what lets
  // "is there one of these before me" be answered at all.
  const met = [...candidates].filter((candidate) => passes(group, candidate, root, index, census, node)).length
  if (group.type === 'atLeast') return met >= (group.value ?? 1)
  if (group.type === 'atMost') return met <= (group.value ?? 0)
  if (group.type === 'equalTo') return met === (group.value ?? 0)
  if (group.type === 'and') return met === candidates.size
  if (group.type === 'or') return met > 0
  census.note(`local condition group type ${String(group.type)}`)
  return false
}

function holds(condition: Condition, node: Node, root: Node, index: CatalogueIndex, census: Census, subject: Node = node): boolean {
  // Ordering is about position rather than about counting anything.
  if (condition.type === 'before') return node.order < subject.order
  if (condition.type === 'after') return node.order > subject.order

  // `instanceOf` reads both ways depending on the scope: "am I one of these" with a
  // scope of self, "is there one of these in here" with a scope of the roster. Both
  // are satisfied by counting the scope alongside its contents.
  const asks = condition.type === 'instanceOf' || condition.type === 'notInstanceOf'
  const measured = measure(asks ? { ...condition, includeSelf: true } : condition, node, root, index, census)
  switch (condition.type) {
    case 'instanceOf':
      return measured > 0
    case 'notInstanceOf':
      return measured === 0
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
    // A new condition type breaks this rather than being quietly treated as met.
    default: {
      const unhandled: never = condition.type
      census.note(`condition type ${String(unhandled)}`)
      return false
    }
  }
}

type Measurable = {
  field: string
  scope: string
  childId?: string
  includeChildSelections?: boolean
  /** Counts the scope itself, not only what is in it. What `instanceOf` needs. */
  includeSelf?: boolean
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

  const origins = resolveScope(spec.scope, node, root, index, census)
  if (!origins.length) return 0

  const seen = new Set<Node>()
  for (const origin of origins) {
    if (spec.includeSelf && matches(origin, spec.childId, root, index, census)) seen.add(origin)
    for (const candidate of selectionsUnder(origin, spec.includeChildSelections === true)) {
      if (matches(candidate, spec.childId, root, index, census)) seen.add(candidate)
    }
  }
  const matching = [...seen]

  if (spec.field === 'selections') return matching.reduce((total, each) => total + each.count, 0)
  // Attachments live on saved picks, outside the selection tree. Only profile
  // projection supplies them; ordinary evaluation validates them separately.
  if (spec.field === 'associations') return census.associations
  if (index.costTypes.has(spec.field)) {
    return matching.reduce((total, each) => total + (costOf(each, spec.field) ?? 0) * each.count, 0)
  }
  if (spec.field === 'forces') {
    // A roster has exactly one force today, so this counts whether it is the kind
    // being asked about — which is how Crusade-only content is gated.
    return origins.flatMap((origin) => forcesUnder(origin)).filter((force) => matches(force, spec.childId, root, index, census)).length
  }
  census.note(`measured field ${spec.field}`)
  return 0
}

const costOf = (node: Node, typeId: string) =>
  sourcesOf(node)
    .flatMap((source) => source.costs ?? [])
    .find((cost: Cost) => cost.typeId === typeId)?.value

function matches(node: Node, childId: string | undefined, root: Node, index: CatalogueIndex, census: Census): boolean {
  if (!childId || childId === 'any') return true
  if (ENTRY_TYPES.has(childId)) {
    const type = node.target.type
    return childId === 'model-or-unit' ? type === 'model' || type === 'unit' : type === childId
  }
  return node.target.id === childId || node.id === childId || inGroup(node, childId) || inCategory(node, childId, root, index, census)
}

/**
 * Whether this selection carries a keyword. Conditions test membership far more
 * often than identity — "is this inside a model of my own faction" is a category
 * test — so ignoring category links makes every such test answer no.
 *
 * A keyword the data hands out or takes away answers for itself; everything else
 * is what the entry's own links write down.
 */
function inCategory(node: Node, categoryId: string, root: Node, index: CatalogueIndex, census: Census): boolean {
  const granted = grantsOf(root, index, census).get(node)?.get(categoryId)
  return granted ?? isLinkedCategory(node, categoryId)
}

const isLinkedCategory = (node: Node, categoryId: string) =>
  sourcesOf(node).some((source) => (source.categoryLinks ?? []).some((link) => link.targetId === categoryId))

const linkedCategories = (node: Node) =>
  new Set(sourcesOf(node).flatMap((source) => (source.categoryLinks ?? []).map((link) => link.targetId)))

/**
 * The keywords the data grants and withdraws, read once for the whole tree.
 *
 * Most keywords are written as category links, but a book also hands them out
 * conditionally: a Chaplain in Terminator Armour is DEATHWING only when Dark
 * Angels is the book the list is built from, and an enhancement gated on that
 * keyword cannot be offered to a list that does not carry it. A grant is not
 * always about the entry holding it — `scope` aims one at a parent, a model or the
 * root entry — so this is read from the top rather than per node.
 */
function grantsOf(root: Node, index: CatalogueIndex, census: Census): Map<Node, Map<string, boolean>> {
  if (root.grants) return root.grants
  const grants = new Map<Node, Map<string, boolean>>()
  /*
   * Published empty before the pass reads anything, because a grant's own conditions
   * can ask about keywords, including the ones this pass is deciding. An empty map
   * answers every one of those from the written links, which is what keeps the pass
   * finite and its answer independent of the order the tree is walked in: a grant may
   * depend on what the data writes down, never on another grant.
   */
  root.grants = grants
  const decided: { target: Node; categoryId: string; present: boolean }[] = []
  for (const node of descendants(root)) {
    for (const modifier of modifiersOf(node)) {
      if (modifier.field !== 'category') continue
      // `set-primary` and `unset-primary` change which keyword shelves a datasheet,
      // not which keywords it carries. They are understood but irrelevant here.
      if (modifier.type === 'set-primary' || modifier.type === 'unset-primary') continue
      if (modifier.type !== 'add' && modifier.type !== 'remove') {
        census.note(`category modifier ${modifier.type}`)
        continue
      }
      if (typeof modifier.value !== 'string') {
        census.note(`category modifier ${modifier.type} without a keyword`)
        continue
      }
      if (repeatCount(modifier, node, root, index, census) === 0) continue
      for (const target of aimedAt(modifier, node, root, index, census)) {
        decided.push({ target, categoryId: modifier.value, present: modifier.type === 'add' })
      }
    }
  }
  // Written order decides between a grant and a withdrawal of the same keyword — the
  // Adepta Sororitas give Saint Potentia hers and take it away again on one entry —
  // so these are applied in the order they were read, after every one has been read.
  for (const { target, categoryId, present } of decided) {
    const held = grants.get(target) ?? new Map<string, boolean>()
    held.set(categoryId, present)
    grants.set(target, held)
  }
  return grants
}

/** The selections a keyword modifier is aimed at: where its scope lands, narrowed by what it affects. */
function aimedAt(modifier: Modifier, node: Node, root: Node, index: CatalogueIndex, census: Census): Node[] {
  const origins = resolveScope(modifier.scope ?? 'self', node, root, index, census)
  if (!modifier.affects) return origins
  const reach = parseAffects(modifier.affects.split('.'))
  // Which group a keyword written against one is meant to reach is not something
  // the data says here, and guessing hands the keyword to the wrong selections.
  if (reach.group) {
    census.note('keyword granted to a group')
    return []
  }
  const found = new Set<Node>()
  for (const origin of origins) {
    if (reach.includeSelf) found.add(origin)
    // A force is transparent to `selectionsUnder`, so reaching across the roster's
    // forces needs nothing beyond walking it.
    if (reach.includeEntries || reach.forces) for (const child of selectionsUnder(origin, reach.recursive)) found.add(child)
  }
  return [...found].filter((each) => reach.filters.every((filter) => matches(each, filter, root, index, census)))
}

/**
 * Where a condition looks. An entry id means "me, or the nearest ancestor with
 * that id" — which is how a unit's own modifiers count the models inside it.
 *
 * Returns a list because `ancestor` means every ancestor, not one of them.
 */
function resolveScope(scope: string, node: Node, root: Node, index: CatalogueIndex, census: Census): Node[] {
  switch (scope) {
    case 'self':
      return [node]
    case 'parent': {
      // A datasheet sits directly in the force, and what it asks about its parent it
      // means about itself: an enhancement is a child of the unit that bears it, so
      // reading the force here let one character's relic change another's weapons.
      // A group standing between them — a library of enhancements reached through
      // one link — is catalogue organisation rather than a roster selection, so it
      // is not the parent either: skipping past it is what keeps "the bearer's
      // unit" reaching the bearer instead of stopping at the library it chose from.
      let parent = node.parent
      while (parent && isGroup(parent)) parent = parent.parent
      if (!parent || parent.force || parent === root) return [node]
      return [parent]
    }
    case 'roster':
      return [root]
    case 'force': {
      for (let current: Node | null = node; current; current = current.parent) {
        if (current.force) return [current]
      }
      return [root]
    }
    case 'ancestor':
      return ancestors(node)
    case 'root-entry':
      return [rootEntry(node)]
    // The enclosing unit, which is what a per-model cost is nearly always counted in.
    // The `-self` spelling is the same question: `enclosing` counts the node itself,
    // which is what including self means.
    case 'unit':
    case 'unit-self':
    case 'model':
    case 'model-self':
    case 'model-or-unit':
    case 'model-or-unit-self':
    case 'upgrade':
      return enclosing(node, scope.startsWith('model-or-unit') ? ['model', 'unit'] : [scope.replace(/-self$/, '')])
    case 'root-entry-self':
      return [rootEntry(node)]
    case 'primary-catalogue':
      census.note('scope primary-catalogue')
      return []
    default: {
      for (let current: Node | null = node; current; current = current.parent) {
        if (current.target.id === scope || current.id === scope) return [current]
      }
      if (index.definitions.has(scope)) return []
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
  for (let current = node.parent; current && !current.force; current = current.parent) chain.push(current)
  return chain
}

function rootEntry(node: Node): Node {
  let current = node
  while (current.parent && !current.parent.force && current.parent.parent) current = current.parent
  return current
}

function violations(node: Node, root: Node, index: CatalogueIndex, census: Census): EvaluationError[] {
  if (node === root) return []
  const errors: EvaluationError[] = []
  const name = node.target.name ?? node.target.id

  for (const constraint of sourcesOf(node).flatMap((source) => source.constraints ?? [])) {
    const limit = constraintValue(constraint, node, root, index, census) * carriers(constraint, node)
    if (limit < 0) continue
    if (constraint.percentValue) {
      census.note('constraint percentValue')
      continue
    }
    // A constraint on an entry counts that entry within the scope, so what is
    // being counted is the node itself.
    const raw = measure({ ...constraint, childId: node.target.id }, node, root, index, census)
    // An unmarked mandatory child beneath an aggregated model is stored once as
    // the model's template, while its minimum applies once to every model.
    const measured = constraint.type === 'min' && raw === 1 ? raw * carriers(constraint, node) : raw
    if (constraint.type === 'min' && measured < limit) {
      errors.push({ entryId: node.target.id, entryName: name, message: `needs at least ${limit}, has ${measured}` })
    }
    if (constraint.type === 'max' && measured > limit) {
      errors.push({ entryId: node.target.id, entryName: name, message: `allows at most ${limit}, has ${measured}` })
    }
  }
  return errors
}

/**
 * How many times over a per-parent limit applies.
 *
 * A child of an aggregated model holds a total for all copies of that model, and its
 * `@parent` constraints are written per model — "each model may take one gauss
 * blaster" is `max=1`. So the limit for a squad of ten is ten. Most such entries are
 * explicitly `collective`, but some catalogue groups omit that marker while their
 * selection still holds the squad's total. Reading the one literally called every
 * such squad illegal.
 */
function carriers(constraint: Constraint, node: Node): number {
  if (constraint.scope !== 'parent') return 1
  const collective = Boolean(node.target.type !== undefined && 'collective' in node.target && node.target.collective)
  const holdsCollective = isGroup(node) && node.children.some((child) => 'collective' in child.target && child.target.collective === true)
  // Groups hold no carrier count of their own, so the models holding this are the
  // nearest entry above them. An aggregated model scales every parent-scoped child:
  // the catalogue can omit `collective` even though the selection stores one total
  // for all copies of that model.
  let holder = node.parent
  while (holder && isGroup(holder)) holder = holder.parent
  const aggregatedModel = holder?.target.type === 'model' && holder.count > 1
  if (!collective && !holdsCollective && !aggregatedModel) return 1
  return Math.max(1, holder?.count ?? 1)
}

/** A constraint's limit after any modifier aimed at it by id — how points limits change per game size. */
function constraintValue(
  constraint: Constraint,
  node: Node,
  root: Node,
  index: CatalogueIndex,
  census: Census,
  extra: readonly Modifier[] = [],
): number {
  let value = constraint.value
  for (const modifier of [...modifiersOf(node), ...extra]) {
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
