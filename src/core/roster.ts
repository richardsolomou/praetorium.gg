/**
 * Building a legal starting selection for a unit.
 *
 * Picking a unit in an army list does not mean picking a bare model: the
 * catalogue requires its mandatory wargear, and a squad requires a minimum
 * number of bodies. This produces that — the smallest selection the data would
 * accept — which is both what a player should be handed when they add a unit and
 * what any honest points check has to start from.
 *
 * Pure, like the rest of `src/core`.
 */

import { type CatalogueIndex, type Constraint, type Definition, targetOf } from './catalogue'
import { evaluate, hiddenByRules, selectionCountBounds, type EvaluateOptions } from './evaluate'
import type { Selection } from './evaluate'

/** Crusade and campaign subtrees run deep and none of it is mandatory. */
const MAX_DEPTH = 4

type DefaultOptions = EvaluateOptions & { maxDepth?: number }

/**
 * What a player picked, in the form a saved list keeps.
 *
 * Deliberately the picks rather than the expanded selections: re-pricing them
 * against the catalogue an instance currently holds is the honest answer when
 * Games Workshop changes points.
 */
export type RosterPick = {
  entryId: string
  /** The catalogue that owns an allied unit; absent for the primary force. */
  catalogueId?: string
  models?: number
  choices?: Record<string, string>
  /**
   * How many of each option a group holds, for groups that hold more than one.
   *
   * "Eight keep the gauss blaster, two take tesla carbines" is a squad splitting
   * one group between two options, which a single chosen id cannot say.
   */
  spreads?: Record<string, Record<string, number>>
  /**
   * How many models took each datasheet swap, keyed `<swap id>#<alternative>`.
   *
   * A count rather than a choice, because a squad divides itself: two gravis veterans
   * can carry one infernus heavy bolter and one frag cannon between them. Only swaps
   * that cost nothing are offered, so this changes what a unit carries without
   * changing what it costs — which is why it can sit beside the catalogue's own
   * choices without the evaluator knowing about it.
   */
  swaps?: Record<string, number>
  /** Optional single entries such as Warlord, keyed by their catalogue path. */
  toggles?: Record<string, number>
  /** The position of the unit this one joins in the saved pick list. */
  attachedTo?: number
}

type BuildContext = {
  primaryCatalogueId?: string
  roster?: readonly Selection[]
  spreads?: Readonly<Record<string, Record<string, number>>>
  toggles?: Readonly<Record<string, number>>
}

/**
 * The smallest legal selection of an entry, or null when the id is unknown.
 *
 * Only what the data insists on is included. An optional upgrade is a choice for
 * the player, and guessing at one would put points on a list nobody asked for.
 */
export function defaultSelection(entryId: string, index: CatalogueIndex, options: DefaultOptions = {}): Selection | null {
  const definition = index.definitions.get(entryId)
  if (!definition) return null
  return expand(entryId, definition, index, options.maxDepth ?? MAX_DEPTH, 1, new Set(), 1, options)
}

function expand(
  id: string,
  definition: Definition,
  index: CatalogueIndex,
  depth: number,
  count: number,
  seen: Set<string>,
  carriers: number,
  options: DefaultOptions = {},
): Selection {
  const target = resolve(definition, index)
  if (depth <= 0 || seen.has(target.id)) return { id, count }

  const visited = new Set(seen).add(target.id)
  const available = childrenOf(target, index).filter((child) => !hiddenByRules(child.definition, index, options))

  // A group holds no count of its own: "at least four selections of this group"
  // is satisfied by what goes inside it, so the requirement passes to a child.
  // Putting the number on the group itself leaves the group empty, which reads as
  // a squad with no models in it.
  if (target.type === undefined) {
    // Spread the requirement across what the group offers, respecting each
    // option's own cap: two selections from a group of one-each choices means one
    // of two things, not two of one.
    const inside: Selection[] = []
    // Reserve room for options with their own minimum before the declared default
    // consumes the group's allowance. Mixed squads commonly put the ordinary
    // model first and a required sergeant later in the catalogue.
    const reserved = available.reduce(
      (total, child) => total + requiredCount(child.definition, index, options) * scaleOf(child.definition, index, carriers),
      0,
    )
    let remaining = Math.max(0, count - reserved)
    for (const child of ordered(target, available, index)) {
      const scale = scaleOf(child.definition, index, carriers)
      const cap = maximumCount(child.definition, index, options)
      const room = cap === null ? null : cap * scale
      const share = remaining > 0 ? (room === null ? remaining : Math.min(remaining, room)) : 0
      // A child's own minimum applies whatever the group asks for, so a group with
      // no requirement still yields what its contents demand.
      const take = Math.max(share, requiredCount(child.definition, index, options) * scale)
      if (take <= 0 && resolve(child.definition, index).type === undefined) {
        const built = expand(child.id, child.definition, index, depth - 1, 0, visited, carriers, options)
        if (built.selections?.length) inside.push(built)
        continue
      }
      if (take <= 0) continue
      inside.push(expand(child.id, child.definition, index, depth - 1, take, visited, carriers, options))
      remaining -= Math.min(remaining, take)
    }
    return inside.length ? { id, count: 1, selections: inside } : { id, count: 1 }
  }

  const children: Selection[] = []
  // What this entry holds is held by `count` of it, which is what a per-model
  // requirement inside is counted against.
  const held = Math.max(1, count)
  for (const child of available) {
    const required = requiredCount(child.definition, index, options) * scaleOf(child.definition, index, held)
    if (resolve(child.definition, index).type === undefined) {
      // Always look inside a group. One with no minimum of its own can still hold
      // entries that insist on themselves — which is how most squads are written —
      // and skipping it leaves the unit with a sergeant and nobody to lead.
      const built = expand(child.id, child.definition, index, depth - 1, required, visited, held, options)
      if (built.selections?.length) children.push(built)
      continue
    }
    if (required <= 0) continue
    children.push(expand(child.id, child.definition, index, depth - 1, required, visited, held, options))
  }

  return children.length ? { id, count, selections: children } : { id, count }
}

type Option = { id: string; definition: Definition }

/**
 * What a group offers, best first: what it names as its default, then the cheapest,
 * then entries before nested groups.
 *
 * Cheapest matters. A mandatory choice has to be made for the player, and making
 * it an expensive one puts points on a list nobody asked for — the floor of a
 * datasheet is what this is for.
 */
function ordered(group: Definition, options: Option[], index: CatalogueIndex): Option[] {
  const named = 'defaultSelectionEntryId' in group ? group.defaultSelectionEntryId : undefined
  return options.toSorted(
    (left, right) =>
      Number(right.id === named) - Number(left.id === named) ||
      pointsOf(left, index) - pointsOf(right, index) ||
      kindOf(left, index) - kindOf(right, index),
  )
}

function pointsOf(option: Option, index: CatalogueIndex) {
  const target = resolve(option.definition, index)
  const own = option.definition.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value
  return own ?? target.costs?.find((cost) => cost.typeId === index.pointsTypeId)?.value ?? 0
}

const kindOf = (option: Option, index: CatalogueIndex) => (resolve(option.definition, index).type === undefined ? 1 : 0)

/**
 * Whether this entry's count is a total for the whole unit rather than one model's.
 *
 * A `collective` weapon under a squad of ten is ten weapons stored as one number,
 * and its `@parent` constraints are per model — "each model may take one" reads as
 * `max=1`, so a ten-model squad may hold ten. Everything about splitting a squad
 * between two weapons follows from that: the counts are absolute and they share
 * one capacity.
 */
function isCollective(definition: Definition, index: CatalogueIndex): boolean {
  const target = resolve(definition, index)
  return Boolean(('collective' in definition && definition.collective) || ('collective' in target && target.collective))
}

/**
 * How many carriers a child's `@parent` constraint is counted against: the models
 * holding it when it is collective, one otherwise. A group takes the factor of what
 * it holds, because the constraint is written on the group and meant per model.
 */
function scaleOf(definition: Definition, index: CatalogueIndex, carriers: number): number {
  if (isCollective(definition, index)) return carriers
  const target = resolve(definition, index)
  if (target.type !== undefined) return 1
  return childrenOf(target, index).some((child) => isCollective(child.definition, index)) ? carriers : 1
}

/** The binding cap on how many of this may be taken, or null when nothing limits it. */
function maximumCount(definition: Definition, index: CatalogueIndex, options?: EvaluateOptions): number | null {
  if (options) return selectionCountBounds(definition, index, options).maximum
  const target = resolve(definition, index)
  const constraints = [...(definition.constraints ?? []), ...(target === definition ? [] : (target.constraints ?? []))]
  const caps = constraints
    .filter((constraint) => constraint.type === 'max' && constraint.field === 'selections' && !constraint.percentValue)
    .map((constraint) => constraint.value)
    .filter((value) => value >= 0)
  return caps.length ? Math.min(...caps) : null
}

/** How many of this child the data insists on: its own minimum, or a group's. */
function requiredCount(definition: Definition, index: CatalogueIndex, options?: EvaluateOptions): number {
  if (options) return selectionCountBounds(definition, index, options).minimum
  const target = resolve(definition, index)
  const constraints = [...(definition.constraints ?? []), ...(target === definition ? [] : (target.constraints ?? []))]
  const minimums = constraints.filter(isSelectionMinimum).map((constraint) => constraint.value)
  return minimums.length ? Math.max(...minimums) : 0
}

const isSelectionMinimum = (constraint: Constraint) =>
  constraint.type === 'min' && constraint.field === 'selections' && (constraint.scope === 'parent' || constraint.scope === 'self')

function childrenOf(definition: Definition, index: CatalogueIndex) {
  const found: { id: string; definition: Definition }[] = []
  for (const entry of definition.selectionEntries ?? []) found.push({ id: entry.id, definition: entry })
  for (const group of definition.selectionEntryGroups ?? []) found.push({ id: group.id, definition: group })
  for (const link of definition.entryLinks ?? []) {
    const target = index.definitions.get(link.targetId)
    if (target) found.push({ id: link.id, definition: link })
  }
  return found
}

const resolve = (definition: Definition, index: CatalogueIndex) => targetOf(definition, index.definitions)

/**
 * Lays `overrides` over a selection tree by path, so a caller can say "this unit,
 * but with five of that model" without restating its mandatory wargear.
 */
export function withCounts(selection: Selection, overrides: readonly { path: readonly string[]; count: number }[]): Selection {
  return overrides.reduce<Selection>((tree, override) => applyCount(tree, override.path, override.count), selection)
}

function applyCount(selection: Selection, path: readonly string[], count: number): Selection {
  const [next, ...rest] = path
  if (next === undefined) return { ...selection, count }

  const children = [...(selection.selections ?? [])]
  const index = children.findIndex((child) => child.id === next)
  const existing = children[index] ?? { id: next, count: 1 }
  const replaced = applyCount(existing, rest, count)
  if (index >= 0) children[index] = replaced
  else children.push(replaced)

  return { ...selection, selections: children }
}

/**
 * How many models a unit may field, and which selection to change to resize it.
 *
 * A datasheet is a fixed part — a sergeant, a champion, a dedicated transport's
 * hull — plus one group whose size the player chooses. The bounds live on that
 * group and govern the *sum* of what is inside it, so they cannot be pushed onto
 * an individual occupant: a group of five to ten holding a sergeant and a body
 * would otherwise report a minimum of six for a five-model squad.
 */
type UnitSize = { min: number; max: number; models: number; path: string[] }

type BoundedGroup = { min: number; max: number; total: number; adjust: string[] }

const UNBOUNDED = Number.MAX_SAFE_INTEGER

export function unitSize(entryId: string, index: CatalogueIndex): UnitSize | null {
  const base = defaultSelection(entryId, index)
  return base ? sizeOf(base, index) : null
}

/** How many models an already-built or imported selection actually contains. */
export function modelCountOf(selection: Selection, index: CatalogueIndex): number {
  const counted = survey(selection, index, [])
  return counted.models + counted.groups.reduce((total, group) => total + group.total, 0)
}

/** Whether the data lets a player change how many models this unit fields. */
export const isResizable = (size: UnitSize) => size.path.length > 0 && size.max > size.min

type UnitToggle = { key: string; name: string; selected: boolean }
export type BuiltUnit = { selection: Selection; size: UnitSize; choices: UnitChoice[]; toggles: UnitToggle[] }

/**
 * The unit as the data hands it over, with the player's choices taken and resized to
 * `models`.
 *
 * One choice can close another: a sergeant given a combi-weapon has no hand left for
 * a power fist, and the catalogue says so by dropping that group's limit to nothing.
 * A choice the data will no longer accept is let go of rather than kept and reported,
 * because the player has already said what they want instead.
 */
export function buildUnit(
  entryId: string,
  index: CatalogueIndex,
  models?: number,
  choices?: Readonly<Record<string, string>>,
  context?: BuildContext,
): BuiltUnit | null {
  const first = assemble(entryId, index, models, choices, context)
  if (!first) return null
  const closed = new Set(
    evaluate([first.selection], index, context)
      .errors.filter((error) => error.message.startsWith('allows at most 0'))
      .map((error) => error.entryId),
  )
  if (!closed.size) return first
  const kept = Object.entries(choices ?? {}).filter(([key]) => {
    const groupId = key.split('/').at(-1)
    const definition = groupId ? index.definitions.get(groupId) : undefined
    return !definition || !closed.has(resolve(definition, index).id)
  })
  if (kept.length === Object.keys(choices ?? {}).length) return first
  return assemble(entryId, index, models, Object.fromEntries(kept), context) ?? first
}

function assemble(
  entryId: string,
  index: CatalogueIndex,
  models?: number,
  choices?: Readonly<Record<string, string>>,
  context?: BuildContext,
): BuiltUnit | null {
  const base = defaultSelection(entryId, index, context)
  if (!base) return null

  // Choices first: an option can bring its own bodies, so sizing has to see them.
  const chosen = Object.entries(choices ?? {}).reduce((tree, [key, optionId]) => withChoice(tree, key, optionId, index), base)
  const composed =
    models === undefined ? chosen : withModelComposition(entryId, chosen, models, new Set(Object.keys(choices ?? {})), index, context)
  const composedSize = sizeOf(composed, index)
  // Then the spreads, which say how many of each option rather than which one.
  //
  // Deepest first, because a model's own wargear is what puts that model in the
  // squad: settle the specialists and the body each one costs, and the group above
  // then shares out what is left. Applied the other way round the group divides all
  // the bodies first, a specialist takes one back from whichever option happens to
  // hold the most, and a squad asked for five combi-weapons and a pyrecannon quietly
  // comes back with four. A count the group keeps for a model that arms itself is
  // never honoured either way, which is what makes the order safe to choose.
  const requests = Object.entries(context?.spreads ?? {}).toSorted(([left], [right]) => right.split('/').length - left.split('/').length)
  // How many of a model there are is settled by that model's own wargear, when it
  // has any: a veteran is in the squad because he is carrying the heavy bolter. The
  // group above may still say how many of everything else it holds, but a count it
  // keeps for that model is a leftover opinion, and honouring it costs a body the
  // rest of the squad then cannot have.
  const governed = (key: string, optionId: string) => requests.some(([other]) => other.startsWith(`${key}/${optionId}/`))
  const spread = requests.reduce((tree, [key, counts]) => {
    const own = Object.entries(counts).filter(([optionId]) => !governed(key, optionId))
    return own.length ? withUnitSpread(tree, key, Object.fromEntries(own), index) : tree
  }, composed)
  const toggled = withCounts(
    spread,
    Object.entries(context?.toggles ?? {}).map(([key, count]) => ({ path: key.split('/'), count })),
  )
  const size = modelCountOf(toggled, index) === modelCountOf(composed, index) ? composedSize : sizeOf(toggled, index)

  if (models === undefined || !size.path.length || models === size.models) {
    const fitted = refit(toggled, index, 1)
    return finishUnit(entryId, fitted, size, index, context)
  }

  const wanted = Math.min(Math.max(models, size.min), size.max)
  const current = countAt(toggled, size.path)
  const resized = withCounts(toggled, [{ path: size.path, count: Math.max(0, current + (wanted - size.models)) }])
  const selection = refit(resized, index, 1)
  return finishUnit(entryId, selection, { ...size, models: wanted }, index, context)
}

function finishUnit(entryId: string, selection: Selection, size: UnitSize, index: CatalogueIndex, context?: BuildContext): BuiltUnit {
  const choices = unitChoices(entryId, selection, index, context)
  const completed = choices.reduce((tree, choice) => {
    const [option] = choice.options
    const defaulted = choice.name.trim().toLowerCase() === 'unit composition' && choice.optional && choice.options.length === 1
    if (!defaulted || !option || option.points !== 0 || context?.spreads?.[choice.key] !== undefined) return tree
    return withUnitSpread(tree, choice.key, { [option.id]: option.max }, index)
  }, selection)
  return {
    selection: completed,
    size,
    choices: unitChoices(entryId, completed, index, context),
    toggles: unitToggles(entryId, completed, index),
  }
}

/** Picks a fixed composition whose expanded models exactly match the requested size. */
function withModelComposition(
  entryId: string,
  selection: Selection,
  models: number,
  explicit: ReadonlySet<string>,
  index: CatalogueIndex,
  context?: { primaryCatalogueId?: string; roster?: readonly Selection[] },
): Selection {
  if (modelCountOf(selection, index) === models) return selection
  const scaled = withProportionalModels(selection, models, index)
  if (modelCountOf(scaled, index) === models) return scaled
  const fitted = withOptionalModels(selection, models, index)
  if (modelCountOf(fitted, index) === models) return fitted
  for (const choice of unitChoices(entryId, selection, index, context)) {
    if (explicit.has(choice.key) || choice.room !== 1) continue
    for (const option of choice.options) {
      const candidate = withChoice(selection, choice.key, option.id, index)
      if (modelCountOf(candidate, index) === models) return candidate
      const completed = withOptionalModels(candidate, models, index)
      if (modelCountOf(completed, index) === models) return completed
    }
  }
  return selection
}

/** Scales every bounded model group together when the requested composition is an exact multiple. */
function withProportionalModels(selection: Selection, models: number, index: CatalogueIndex): Selection {
  const current = modelCountOf(selection, index)
  if (!current || models <= current || models % current !== 0) return selection
  const factor = models / current
  const groups = survey(selection, index, []).groups
  if (!groups.length) return selection
  const overrides = groups.map((group) => ({ path: group.adjust, count: countAt(selection, group.adjust) * factor }))
  if (overrides.some((override, position) => override.count > groups[position].max)) return selection
  const scaled = withCounts(selection, overrides)
  return modelCountOf(scaled, index) === models ? scaled : selection
}

type ModelSlot = { path: string[]; definition: Definition; current: number; max: number }

/** Fills bounded optional model slots when they are the exact remainder of a requested composition. */
function withOptionalModels(selection: Selection, models: number, index: CatalogueIndex): Selection {
  let remaining = models - modelCountOf(selection, index)
  if (remaining <= 0) return selection

  let result = selection
  for (const slot of optionalModelSlots(selection, index)) {
    if (!remaining) break
    const added = Math.min(remaining, slot.max - slot.current)
    if (added <= 0) continue
    const count = slot.current + added
    const shallow = withCounts(result, [{ path: slot.path, count }])
    result = updateSelection(shallow, slot.path, () => expand(slot.path.at(-1)!, slot.definition, index, MAX_DEPTH, count, new Set(), 1))
    remaining -= added
  }
  return remaining ? selection : result
}

function optionalModelSlots(selection: Selection, index: CatalogueIndex): ModelSlot[] {
  const found: ModelSlot[] = []
  const walk = (node: Selection, trail: string[], depth: number, seen: Set<string>) => {
    const definition = index.definitions.get(node.id)
    if (!definition) return
    const target = resolve(definition, index)
    if (depth <= 0 || seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)
    const present = new Map((node.selections ?? []).map((child) => [child.id, child]))

    for (const child of childrenOf(target, index)) {
      const inner = resolve(child.definition, index)
      const here = [...trail, child.id]
      const held = present.get(child.id)
      if (inner.type === 'model') {
        const min = requiredCount(child.definition, index)
        const max = maximumCount(child.definition, index)
        const current = held?.count ?? 0
        if (min === 0 && max !== null && max > current) found.push({ path: here, definition: child.definition, current, max })
        continue
      }
      if (inner.type === undefined && !held) {
        const models = childrenOf(inner, index).filter((option) => resolve(option.definition, index).type === 'model')
        if (models.length === 1) {
          const [model] = models
          if (!model) continue
          const min = requiredCount(model.definition, index)
          const max = maximumCount(model.definition, index)
          if (min === 0 && max !== null && max > 0) {
            found.push({ path: [...here, model.id], definition: model.definition, current: 0, max })
          }
        }
        continue
      }
      if (held) walk(held, here, depth - 1, visited)
    }
  }
  walk(selection, [], MAX_DEPTH, new Set())
  return found
}

/** Optional single entries with roster meaning rather than loadout meaning. */
export function unitToggles(entryId: string, selection: Selection, index: CatalogueIndex): UnitToggle[] {
  const root = index.definitions.get(entryId)
  if (!root) return []
  const found: UnitToggle[] = []
  const walk = (definition: Definition, trail: string[], seen: Set<string>) => {
    const target = resolve(definition, index)
    if (seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)
    for (const child of childrenOf(target, index)) {
      const inner = resolve(child.definition, index)
      const here = [...trail, child.id]
      if (isRosterToggle(inner.name ?? child.definition.name)) {
        found.push({ key: here.join('/'), name: 'Warlord', selected: (at(selection, here)?.count ?? 0) > 0 })
      } else walk(child.definition, here, visited)
    }
  }
  walk(root, [], new Set())
  return found
}

const isRosterToggle = (name: string | undefined) => name?.trim().toLowerCase() === 'warlord'

function sizeOf(base: Selection, index: CatalogueIndex): UnitSize {
  const { models, groups } = survey(base, index, [])
  const total = models + groups.reduce((sum, group) => sum + group.total, 0)
  // A character or a vehicle is one model and has no model children: the entry
  // itself is the body, so a unit with nothing beneath it still fields one.
  if (!total) return { min: 1, max: 1, models: 1, path: [] }

  const flexible = groups.toSorted((left, right) => right.max - right.min - (left.max - left.min))[0]
  if (!flexible) return { min: total, max: total, models: total, path: [] }

  const others = total - flexible.total
  return { min: others + flexible.min, max: others + flexible.max, models: total, path: flexible.adjust }
}

/** Models that cannot vary, and the groups that can. */
function survey(selection: Selection, index: CatalogueIndex, trail: string[]): { models: number; groups: BoundedGroup[] } {
  let models = 0
  const groups: BoundedGroup[] = []

  for (const child of selection.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition) continue
    const target = resolve(definition, index)
    const here = [...trail, child.id]
    const nested = survey(child, index, here)

    if (target.type === 'model') {
      const count = child.count ?? 1
      const min = requiredCount(definition, index)
      const max = maximumCount(definition, index) ?? UNBOUNDED
      // A squad is not always written as a group: sometimes the bodies hang
      // directly off the unit and carry their own bounds.
      if (max > min) groups.push({ min, max, total: count, adjust: here })
      else models += count
      groups.push(...nested.groups)
      continue
    }

    const inside = nested.models + nested.groups.reduce((sum, group) => sum + group.total, 0)
    if (target.type === undefined && inside > 0) {
      // A group's bounds are often absent and carried by its occupants instead,
      // so fall back to what they add up to rather than reporting no limit.
      const occupants = occupantBounds(child, index)
      const min = requiredCount(definition, index) || occupants.min
      const max = maximumCount(definition, index) ?? occupants.max
      if (max > min) {
        groups.push({ min, max, total: inside, adjust: widest(child, index, here) ?? here })
        continue
      }
    }

    models += nested.models
    groups.push(...nested.groups)
  }

  return { models, groups }
}

/** What a group's model occupants add up to, for when the group states no bounds itself. */
function occupantBounds(group: Selection, index: CatalogueIndex): { min: number; max: number } {
  let min = 0
  let max = 0
  for (const child of group.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition || resolve(definition, index).type !== 'model') continue
    min += requiredCount(definition, index)
    max = Math.min(UNBOUNDED, max + (maximumCount(definition, index) ?? UNBOUNDED))
  }
  return { min, max: max || UNBOUNDED }
}

/** Which occupant of a group to grow: the one the data lets take the most. */
function widest(group: Selection, index: CatalogueIndex, trail: string[]): string[] | null {
  let best: { path: string[]; max: number } | null = null
  for (const child of group.selections ?? []) {
    const definition = index.definitions.get(child.id)
    if (!definition) continue
    const target = resolve(definition, index)
    if (target.type === 'model') {
      const max = maximumCount(definition, index) ?? UNBOUNDED
      if (!best || max > best.max) best = { path: [...trail, child.id], max }
      continue
    }
    if (target.type !== undefined) continue
    const nested = widest(child, index, [...trail, child.id])
    if (!nested) continue
    const nestedDefinition = index.definitions.get(nested.at(-1)!)
    const max = nestedDefinition ? (maximumCount(nestedDefinition, index) ?? UNBOUNDED) : 0
    if (!best || max > best.max) best = { path: nested, max }
  }
  return best?.path ?? null
}

function countAt(selection: Selection, path: readonly string[]): number {
  const [next, ...rest] = path
  if (next === undefined) return selection.count ?? 1
  const child = (selection.selections ?? []).find((candidate) => candidate.id === next)
  return child ? countAt(child, rest) : 0
}

/** A decision the data leaves to the player: one of these, in this slot. */
type UnitChoice = {
  /** Path to the group holding the options, as a `/`-joined key the caller can round-trip. */
  key: string
  name: string
  /** Empty when nothing is taken, which an optional group starts out as. */
  chosen: string
  /** An enhancement is a choice a list may simply decline, so it needs a way to say no. */
  optional: boolean
  /**
   * Whether the group hangs off a model the squad need not include.
   *
   * Such a group insists on holding something only once its carrier is there, so
   * emptying it is not a violation — it takes the carrier away with it. That is the
   * difference between a sergeant who must pick one of his weapons and a heavy
   * weapon the squad may simply go without.
   */
  carried: boolean
  /**
   * How many selections the group may hold at once.
   *
   * One is an either-or: a captain's relic blade or his power sword. More than one
   * is a squad dividing itself, and the two want different controls — a choice of
   * one, against a count against each option.
   */
  room: number
  /**
   * `profile` is set when the option is a model rather than a piece of wargear, and
   * names the kind of model it is one loadout of.
   */
  options: { id: string; name: string; points: number; count: number; max: number; profile?: string | null }[]
  /**
   * The specific model this choice belongs to, when it is not every model in the unit.
   *
   * `profile` is the unit profile the model shares with its siblings, which is what
   * separates the kinds of model a datasheet names — a sergeant from the veterans he
   * leads — from the per-loadout entries the catalogue splits each kind into.
   */
  owner: { id: string; name: string; profile: string | null } | null
}

/**
 * The choices a unit offers, and what is currently taken in each.
 *
 * Read from the datasheet rather than from the built selection, because what a
 * unit *may* take is a property of the data: an enhancement group is optional and
 * therefore absent from a default list, and walking only what was built would
 * never offer it.
 */
export function unitChoices(
  entryId: string,
  selection: Selection,
  index: CatalogueIndex,
  options: { primaryCatalogueId?: string; depth?: number; roster?: readonly Selection[] } = {},
): UnitChoice[] {
  const depth = options.depth ?? MAX_DEPTH
  // The unit's own selection has to be in the roster it is judged against, or a
  // question about its surroundings has nothing to look at.
  const roster = [...(options.roster ?? []), selection]
  const visible = (definition: Definition) => !hiddenByRules(definition, index, { ...options, roster })
  const entry = index.definitions.get(entryId)
  if (!entry) return []

  const choices: UnitChoice[] = []
  const walk = (definition: Definition, trail: string[], left: number, seen: Set<string>, carriers: number) => {
    const target = resolve(definition, index)
    if (left <= 0 || seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)

    for (const child of childrenOf(target, index)) {
      if (!visible(child.definition)) continue
      const inner = resolve(child.definition, index)
      const here = [...trail, child.id]

      const repeatingEntry = inner.type === 'upgrade' ? repeatedModelOn(trail, index) : null
      if (
        repeatingEntry &&
        repeatingEntry.path.length === trail.length &&
        requiredCount(child.definition, index) === 0 &&
        maximumCount(child.definition, index) === 1
      ) {
        const room = effectiveCount(selection, repeatingEntry.path, repeatingEntry.definition, index, options)
        const count = allAt(selection, repeatingEntry.path).reduce(
          (total, model) => total + (at(model, here.slice(repeatingEntry.path.length)) ? (model.count ?? 1) : 0),
          0,
        )
        choices.push({
          key: here.join('/'),
          name: inner.name ?? child.id,
          chosen: count ? child.id : '',
          optional: true,
          room,
          options: [{ id: child.id, name: inner.name ?? child.id, points: pointsOf(child, index), count, max: room }],
          carried: true,
          owner: modelOwnerOf(trail, index),
        })
      }

      if (inner.type === undefined) {
        const choosable = childrenOf(inner, index).filter(
          (option) => visible(option.definition) && resolve(option.definition, index).type !== undefined,
        )
        const repeating = repeatedCarrierOn(here, index)
        const scale = repeating
          ? effectiveCount(selection, repeating.path, repeating.definition, index, options)
          : scaleOf(child.definition, index, carriers)
        const capacity = maximumCount(child.definition, index)
        const room = capacity === null ? occupantRoom(choosable, index) : capacity * scale
        const fixed = choosable.some((option) => requiredCount(option.definition, index) > 0)
        const adjustable = fixed ? choosable.filter((option) => requiredCount(option.definition, index) === 0) : choosable
        const held = repeating
          ? repeatedOptions(selection, repeating.path, here.slice(repeating.path.length))
          : allAt(selection, here).flatMap((group) => group.selections ?? [])
        // One model kind can sit in the group more than once — two veterans with a
        // pyrecannon and two more with a heavy bolter are four selections of the
        // same entry — so how many there are is a sum, not the first one found.
        const countOf = (id: string) =>
          held.filter((present) => present.id === id).reduce((total, present) => total + (present.count ?? 1), 0)
        const adjustableRoom = fixed ? adjustable.reduce((total, option) => total + countOf(option.id), 0) : room
        const optionalSingle = !fixed && adjustable.length === 1 && requiredCount(child.definition, index) === 0
        if ((adjustable.length > 1 || optionalSingle) && adjustableRoom >= 1 && adjustableRoom !== UNBOUNDED) {
          const taken = held.find((present) => (present.count ?? 1) > 0 && adjustable.some((option) => option.id === present.id))
          choices.push({
            key: here.join('/'),
            name: inner.name ?? 'Choice',
            chosen: taken?.id ?? '',
            optional: requiredCount(child.definition, index) === 0,
            room: adjustableRoom,
            options: adjustable.map((option) => ({
              id: option.id,
              name: resolve(option.definition, index).name ?? option.id,
              points: pointsOf(option, index),
              count: countOf(option.id),
              max: repeating ? adjustableRoom : legalMaximum(selection, here, option, adjustable, adjustableRoom, index, options),
              ...(resolve(option.definition, index).type === 'model' ? { profile: modelProfileOf(option.definition, index) } : {}),
            })),
            carried: Boolean(repeating),
            owner: modelOwnerOf(trail, index),
          })
        }
      }

      // What is inside an entry is held by however many of it the selection holds.
      if (inner.type !== 'upgrade') {
        walk(child.definition, here, left - 1, visited, inner.type === undefined ? carriers : (at(selection, here)?.count ?? 1))
      }
    }
  }

  walk(entry, [], depth, new Set(), 1)
  // An owner only means something next to a sibling it differs from. A unit built
  // from one model throughout has nothing to contrast it with, so naming that model
  // on every choice would repeat the unit's own name rather than distinguish anything.
  if (new Set(choices.map((choice) => choice.owner?.id ?? '')).size <= 1) return choices.map((choice) => ({ ...choice, owner: null }))
  return choices
}

/**
 * A kind of model in a unit, as the datasheet names it, and the wargear it carries.
 *
 * The catalogue splits a kind of model into one entry per loadout — a veteran with a
 * bolt rifle beside a veteran with a combi-weapon — which is bookkeeping, not what a
 * player sees on the datasheet. Those entries share a unit profile, and that is what
 * gathers them back into the sergeant and the veterans he leads.
 *
 * Counts are deliberately absent: they live on the choice each row points at, so a
 * caller reads one number rather than holding a second copy free to disagree.
 */
export type ModelKind = {
  name: string
  /**
   * Wargear every model of this kind carries. `count` is stated only when it is not
   * simply one each — a swap having taken some of them away.
   */
  fixed: { name: string; count?: number }[]
  members: { id: string; choiceKey: string | null; baseCount: number }[]
  /** Wargear taken through a choice, in the order the data holds it. */
  rows: { name: string; choiceKey: string; optionId: string }[]
  /**
   * Swaps the datasheet allows that the catalogue does not describe, one row per
   * alternative so every one of them is always on screen whether taken or not.
   */
  swaps?: { key: string; gives: string[]; takes: string[]; count: number; max: number; free: boolean }[]
}

/**
 * The name a kind of model goes by, taken from what its loadouts have in common.
 *
 * The agreement has to end on a word, or it is a coincidence of spelling rather than
 * a name: "Sternguard Veteran w/ " is every loadout's prefix, while two unrelated
 * models could agree as far as "Fooba" and mean nothing by it.
 */
function kindName(names: readonly string[], profile: string | null): string {
  const [first = '', ...rest] = names
  if (!rest.length) return first || (profile ?? '')
  return sharedName(names) ?? profile ?? first
}

/** The name those loadouts agree on, or nothing when they agree on no whole word. */
function sharedName(names: readonly string[]): string | null {
  const [first = '', ...rest] = names
  if (!first || !rest.length) return null
  let shared = 0
  while (shared < first.length && rest.every((name) => name[shared] === first[shared])) shared++
  if (!/[^\p{L}\p{N}]$/u.test(first.slice(0, shared))) return null
  // A name ends where the loadout begins. Loadouts that agree past the "w/" agree on
  // part of a weapon — a gauss flayer and a gauss reaper are both gauss — so the name
  // is cut at the separator rather than at the last word the two happen to share.
  const words = first.slice(0, shared).trim().split(/\s+/)
  const separator = (word: string) => /[^\p{L}\p{N}]/u.test(word)
  const cut = words.findLastIndex((word, position) => position > 0 && separator(word))
  const named = words.slice(0, cut < 0 ? words.length : cut)
  // What a name is joined to its loadout by is written either way round — "w/" or
  // "with" — and neither is part of the name. A model is named in the case a datasheet
  // prints it in, so a trailing lowercase word is the sentence, not the model.
  const joining = (word: string) => separator(word) || word === word.toLocaleLowerCase()
  while (named.length > 1 && joining(named.at(-1) ?? '')) named.pop()
  return named.join(' ') || null
}

/** One entry the catalogue offers as a model, and the profile it names it by, if any. */
type Loadout = { profile: string | null; member: { id: string; name: string; choiceKey: string | null } }

/** What each key gathers, in the order the keys first appear. */
function groupBy<T>(entries: readonly T[], keyOf: (entry: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const entry of entries) {
    const key = keyOf(entry)
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  return groups
}

/**
 * Whether these loadouts are one kind of model the catalogue filed a weapon at a time.
 *
 * They are the same model when a row per weapon says everything the separate entries
 * said: each differs from the rest by exactly one weapon, and no two by the same one.
 * A loadout pairing two weapons is a pairing the player cannot break, and one holding
 * a choice of its own has more to say than a row, so both stay as they were written.
 */
function gathers(group: readonly Loadout[], carried: (id: string) => readonly string[], owns: (id: string) => boolean): boolean {
  if (group.length < 2 || group.some((entry) => owns(entry.member.id))) return false
  const lists = group.map((entry) => carried(entry.member.id))
  const shared = new Set((lists[0] ?? []).filter((name) => lists.every((list) => list.includes(name))))
  const apart = lists.map((list) => list.filter((name) => !shared.has(name)))
  if (apart.some((list) => list.length !== 1)) return false
  const weapons = apart.map((list) => list[0])
  return new Set(weapons).size === weapons.length
}

export function modelKindsOf(
  entryId: string,
  selection: Selection,
  index: CatalogueIndex,
  options: { primaryCatalogueId?: string; depth?: number; roster?: readonly Selection[] } = {},
): ModelKind[] {
  const choices = unitChoices(entryId, selection, index, options)
  type Member = { id: string; name: string; choiceKey: string | null; baseCount: number }
  const found: { profile: string | null; member: Member }[] = []

  const remember = (profile: string | null, member: Member) => {
    // A model reached both as a loadout of its kind and as the owner of a choice is
    // one model. The loadout is kept, because that is where its count is changed.
    if (!found.some((present) => present.member.id === member.id)) found.push({ profile, member })
  }

  for (const choice of choices) {
    for (const option of choice.options) {
      if (option.profile === undefined) continue
      remember(option.profile, { id: option.id, name: option.name, choiceKey: choice.key, baseCount: 0 })
    }
    const owner = choice.owner
    if (!owner) continue
    const trail = choice.key.split('/')
    const depth = trail.indexOf(owner.id)
    remember(owner.profile, {
      id: owner.id,
      name: owner.name,
      choiceKey: null,
      baseCount: depth < 0 ? 0 : countAt(selection, trail.slice(0, depth + 1)),
    })
  }

  // What each loadout carries on its own, read from its own defaults so that a
  // loadout nobody has taken yet still knows its weapon.
  const carriedBy = new Map(
    found.map(({ member }) => {
      const base = defaultSelection(member.id, index, options)
      return [member.id, base ? wargearOf(base, index).map((piece) => piece.name) : []] as const
    }),
  )
  const carriedOf = (id: string) => carriedBy.get(id) ?? []
  const owns = (id: string) => choices.some((choice) => choice.owner?.id === id)

  // Where the catalogue gives no unit profile, the name the loadouts agree on stands
  // in for one: a warrior with a gauss flayer and a warrior with a gauss reaper are
  // both warriors, however many groups the catalogue files them under. The widest set
  // that still says what the entries said is the one gathered, so the unit gives way
  // to the group and the group to the loadouts, and a pairing that cannot be drawn as
  // rows costs only its own card.
  const loose = found.filter((entry) => !entry.profile)
  const nameOf = (entry: Loadout) => {
    const siblings = loose.filter((other) => other.member.choiceKey === entry.member.choiceKey)
    return (siblings.length > 1 ? sharedName(siblings.map((other) => other.member.name)) : null) ?? entry.member.name
  }
  const gathered = new Map<string, { key: string; named: string }>()
  const gather = (key: string, named: string, group: readonly Loadout[]) => {
    for (const entry of group) gathered.set(entry.member.id, { key, named })
  }
  for (const [name, group] of groupBy(loose, nameOf)) {
    if (gathers(group, carriedOf, owns)) {
      gather(`kind:${name}`, name, group)
      continue
    }
    for (const [choiceKey, part] of groupBy(group, (entry) => entry.member.choiceKey ?? entry.member.id)) {
      if (gathers(part, carriedOf, owns)) gather(`kind:${name}/${choiceKey}`, name, part)
      else for (const entry of part) gather(entry.member.id, entry.member.name, [entry])
    }
  }

  const kinds = new Map<string, { profile: string | null; named: string | null; members: Member[] }>()
  for (const entry of found) {
    const gathering = gathered.get(entry.member.id)
    const key = entry.profile ?? gathering?.key ?? entry.member.id
    const kind = kinds.get(key) ?? { profile: entry.profile, named: entry.profile ? null : (gathering?.named ?? null), members: [] }
    kind.members.push(entry.member)
    kinds.set(key, kind)
  }

  const kindsOf = [...kinds.values()].map(({ profile, named, members }) => {
    const carried = members.map((member) => carriedOf(member.id))
    const shared = (carried[0] ?? []).filter((name) => carried.every((list) => list.includes(name)))

    // One loadout at a time, in the order the data holds them, so the weapons read
    // down the card the way the datasheet lists them.
    const rows: ModelKind['rows'] = []
    members.forEach((member, position) => {
      const owned = choices.filter((choice) => choice.owner?.id === member.id)
      if (owned.length) {
        for (const choice of owned) {
          for (const option of choice.options) {
            if (rows.some((row) => row.name === option.name)) continue
            rows.push({ name: option.name, choiceKey: choice.key, optionId: option.id })
          }
        }
        return
      }
      // A loadout holding no choice of its own *is* the choice: taking one is taking
      // the weapon that tells it apart from its siblings.
      if (!member.choiceKey) return
      for (const name of carried[position] ?? []) {
        if (shared.includes(name) || rows.some((row) => row.name === name)) continue
        rows.push({ name, choiceKey: member.choiceKey, optionId: member.id })
      }
    })

    return {
      name:
        named ??
        kindName(
          members.map((member) => member.name),
          profile,
        ),
      fixed: shared.filter((name) => !rows.some((row) => row.name === name)).map((name) => ({ name })),
      members: members.map(({ id, choiceKey, baseCount }) => ({ id, choiceKey, baseCount })),
      rows,
    }
  })

  // The models a unit must have come before the ones it may add, the way a
  // datasheet's composition lists them.
  return kindsOf.toSorted(
    (left, right) => Number(right.members.some((member) => !member.choiceKey)) - Number(left.members.some((member) => !member.choiceKey)),
  )
}

function repeatedOptions(selection: Selection, modelPath: readonly string[], groupPath: readonly string[]): Selection[] {
  const totals = new Map<string, number>()
  for (const model of allAt(selection, modelPath)) {
    const group = at(model, groupPath)
    for (const option of group?.selections ?? []) {
      totals.set(option.id, (totals.get(option.id) ?? 0) + (option.count ?? 1) * (model.count ?? 1))
    }
  }
  return [...totals].map(([id, count]) => ({ id, count }))
}

/** The unit profile a model entry carries, which is what names its kind. */
export function modelProfileOf(definition: Definition, index: CatalogueIndex): string | null {
  return resolve(definition, index).profiles?.find((profile) => profile.typeName === 'Unit')?.name ?? null
}

/** The nearest ancestor model a choice sits inside, when it is not the unit's own root. */
function modelOwnerOf(trail: readonly string[], index: CatalogueIndex): UnitChoice['owner'] {
  for (let length = trail.length; length > 0; length--) {
    const id = trail[length - 1]
    const definition = id ? index.definitions.get(id) : undefined
    if (!definition || resolve(definition, index).type !== 'model') continue
    const target = resolve(definition, index)
    // The id a selection is reached by, not the id it resolves to: a supplement links
    // the datasheet it borrows, and only the link appears in the path.
    return { id, name: definition.name ?? target.name ?? id, profile: modelProfileOf(definition, index) }
  }
  return null
}

function repeatableModelOn(path: readonly string[], index: CatalogueIndex): { path: string[]; definition: Definition } | null {
  for (let length = path.length; length > 0; length--) {
    const id = path[length - 1]
    const definition = id ? index.definitions.get(id) : undefined
    if (!definition || resolve(definition, index).type !== 'model') continue
    if (requiredCount(definition, index) === 0 && maximumCount(definition, index) !== null) {
      return { path: path.slice(0, length), definition }
    }
  }
  return null
}

function repeatedModelOn(path: readonly string[], index: CatalogueIndex): { path: string[]; definition: Definition } | null {
  for (let length = path.length; length > 0; length--) {
    const id = path[length - 1]
    const definition = id ? index.definitions.get(id) : undefined
    if (!definition || resolve(definition, index).type !== 'model') continue
    if ((maximumCount(definition, index) ?? 1) > 1) return { path: path.slice(0, length), definition }
  }
  return null
}

function repeatedCarrierOn(groupPath: readonly string[], index: CatalogueIndex) {
  const groupId = groupPath.at(-1)
  const group = groupId ? index.definitions.get(groupId) : undefined
  if (!group || childrenOf(resolve(group, index), index).some((option) => isCollective(option.definition, index))) return null
  const modelPath = groupPath.slice(0, -1)
  return repeatedModelOn(modelPath, index) ?? repeatableModelOn(modelPath, index)
}

function effectiveCount(
  selection: Selection,
  path: readonly string[],
  definition: Definition,
  index: CatalogueIndex,
  context: { primaryCatalogueId?: string; roster?: readonly Selection[] },
): number {
  const targetId = resolve(definition, index).id
  const ceiling = Math.max(1, modelCountOf(selection, index))
  const size = sizeOf(selection, index)
  const existing = allAt(selection, path).reduce((total, model) => total + (model.count ?? 1), 0)
  for (let count = Math.max(1, existing + 1); count <= ceiling; count++) {
    let candidate = withCounts(selection, [{ path, count }])
    if (size.path.length && size.path.join('/') !== path.join('/')) {
      const resized = countAt(candidate, size.path) - (count - existing)
      if (resized < 0) return count - 1
      candidate = withCounts(candidate, [{ path: size.path, count: resized }])
    }
    const result = evaluate([...(context.roster ?? []), candidate], index, { primaryCatalogueId: context.primaryCatalogueId })
    if (result.errors.some((error) => error.entryId === targetId && error.message.startsWith('allows at most'))) {
      return Math.max(existing, count - 1)
    }
  }
  return ceiling
}

/** The effective cap after conditional catalogue modifiers have been applied. */
function legalMaximum(
  selection: Selection,
  path: readonly string[],
  option: Option,
  siblings: readonly Option[],
  room: number,
  index: CatalogueIndex,
  context: { primaryCatalogueId?: string; roster?: readonly Selection[] },
): number {
  const targetId = resolve(option.definition, index).id
  for (let count = 1; count <= room; count++) {
    const other = siblings.find((candidate) => candidate.id !== option.id)
    const counts: Record<string, number> = { [option.id]: count }
    if (other) counts[other.id] = room - count
    const candidate = withSpread(selection, path.join('/'), counts)
    const result = evaluate([...(context.roster ?? []), candidate], index, { primaryCatalogueId: context.primaryCatalogueId })
    if (result.errors.some((error) => error.entryId === targetId && error.message.startsWith('allows at most'))) return count - 1
  }
  return room
}

const occupantRoom = (choosable: Option[], index: CatalogueIndex) =>
  choosable.length ? Math.min(...choosable.map((option) => maximumCount(option.definition, index) ?? UNBOUNDED)) : UNBOUNDED

/**
 * Swaps a choice: whatever was taken is emptied and the new option takes its
 * place, so the group holds exactly what it is allowed to. The group need not be
 * in the tree yet — an optional one is not until something is put in it.
 */
export function withChoice(selection: Selection, key: string, optionId: string, index: CatalogueIndex): Selection {
  const path = key.split('/')
  const groupId = path.at(-1)
  const group = groupId ? index.definitions.get(groupId) : undefined
  if (!group) return selection

  const options = new Set(childrenOf(resolve(group, index), index).map((option) => option.id))
  const present = at(selection, path) ? selection : withCounts(selection, [{ path, count: 1 }])
  if (!optionId)
    return updateSelection(present, path, (held) => ({ ...held, selections: held.selections?.filter((child) => !options.has(child.id)) }))

  const required = Math.max(1, requiredCount(index.definitions.get(optionId) ?? { id: optionId }, index))
  const definition = index.definitions.get(optionId)
  const replacement = definition
    ? expand(optionId, definition, index, MAX_DEPTH, required, new Set(), 1)
    : { id: optionId, count: required }
  return updateSelection(present, path, (held) => ({
    ...held,
    selections: [...(held.selections ?? []).filter((child) => !options.has(child.id)), replacement],
  }))
}

function updateSelection(selection: Selection, path: readonly string[], update: (selection: Selection) => Selection): Selection {
  const [next, ...rest] = path
  if (next === undefined) return update(selection)
  return {
    ...selection,
    selections: (selection.selections ?? []).map((child) => (child.id === next ? updateSelection(child, rest, update) : child)),
  }
}

/**
 * Sets how many of one option a group holds, leaving its siblings alone.
 *
 * This is the difference from `withChoice`, which empties the group first: a squad
 * splitting itself between two weapons wants both counts standing at once.
 */
export function withSpread(selection: Selection, key: string, counts: Readonly<Record<string, number>>): Selection {
  const path = key.split('/')
  return withCounts(
    selection,
    Object.entries(counts).map(([optionId, count]) => ({ path: [...path, optionId], count })),
  )
}

/** Repeated specialist models need one model branch per nested option. */
function withUnitSpread(selection: Selection, key: string, counts: Readonly<Record<string, number>>, index: CatalogueIndex): Selection {
  const path = key.split('/')
  const groupId = path.at(-1)
  const group = groupId ? index.definitions.get(groupId) : undefined
  const occupants = group ? childrenOf(resolve(group, index), index) : []
  if (occupants.some((option) => resolve(option.definition, index).type === 'model')) {
    // Only what the request speaks about. Rebuilding the whole group from it would
    // drop the models it says nothing about — a squad told how many bolt rifles it
    // wants is not saying it has no sergeant.
    const optionIds = new Set(Object.keys(counts))
    const capacity = maximumCount(group!, index)
    return updateSelection(selection, path, (held) => {
      // A saved list can ask for more bodies than the squad has, either because the
      // catalogue's limits moved under it or because two of its own requests
      // disagree. The group's own maximum is the answer, and the models it says
      // nothing about are counted first because they are already standing there.
      const untouched = (held.selections ?? []).filter((child) => !optionIds.has(child.id))
      let left =
        capacity === null || capacity === UNBOUNDED
          ? Number.POSITIVE_INFINITY
          : Math.max(0, capacity - untouched.reduce((total, child) => total + (child.count ?? 1), 0))
      return {
        ...held,
        selections: [
          ...untouched,
          ...occupants.flatMap((option) => {
            if (!Object.hasOwn(counts, option.id)) return []
            const count = Math.min(counts[option.id] ?? 0, left)
            left -= count
            return count > 0 ? [expand(option.id, option.definition, index, MAX_DEPTH, count, new Set(), 1)] : []
          }),
        ],
      }
    })
  }
  const repeatedEntry = repeatedModelOn(path.slice(0, -1), index)
  const entry = group ? resolve(group, index) : undefined
  if (repeatedEntry && entry?.type === 'upgrade' && groupId) {
    return spreadRepeatedUpgrade(selection, path, counts[groupId] ?? 0, repeatedEntry)
  }

  const repeating = repeatedCarrierOn(path, index)
  if (!repeating) return withSpread(selection, key, counts)

  return spreadRepeatedGroup(selection, path, counts, repeating, index)
}

function spreadRepeatedUpgrade(selection: Selection, path: readonly string[], requested: number, repeating: { path: string[] }) {
  const modelId = repeating.path.at(-1)
  if (!modelId) return selection
  const models = allAt(selection, repeating.path)
  const carriers = models.reduce((total, model) => total + (model.count ?? 1), 0)
  const withinModel = path.slice(repeating.path.length)
  const variants: Selection[] = []
  let remaining = Math.min(carriers, Math.max(0, requested))
  for (const model of models) {
    const count = model.count ?? 1
    const base = withoutSelectionAt(model, withinModel)
    const taking = Math.min(remaining, count)
    if (taking) variants.push(withCounts({ ...base, count: taking }, [{ path: withinModel, count: 1 }]))
    if (taking < count) variants.push({ ...base, count: count - taking })
    remaining -= taking
  }
  return replaceAt(selection, repeating.path.slice(0, -1), modelId, variants)
}

function spreadRepeatedGroup(
  selection: Selection,
  path: readonly string[],
  counts: Readonly<Record<string, number>>,
  repeating: { path: string[]; definition: Definition },
  index: CatalogueIndex,
) {
  const modelId = repeating.path.at(-1)
  if (!modelId) return selection
  const withinModel = path.slice(repeating.path.length)
  const models = allAt(selection, repeating.path)
  const requested = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([optionId, count]) => ({ optionId, remaining: count }))
  const variants: Selection[] = []
  let requestAt = 0
  // A model the squad took on only to carry this weapon — one the data does not
  // insist on, holding a group it does insist on — has no reason to stay once the
  // weapon is put down. Shieldvanes are the other case: the models were always
  // there and the upgrade is what is optional, so an unequipped one has to remain.
  const group = index.definitions.get(path.at(-1) ?? '')
  const disposable = requiredCount(repeating.definition, index) === 0 && Boolean(group) && requiredCount(group!, index) > 0

  for (const model of models) {
    const base = withoutSelectionAt(model, withinModel)
    let remaining = model.count ?? 1
    while (remaining > 0 && requestAt < requested.length) {
      const request = requested[requestAt]
      if (!request) break
      const count = Math.min(remaining, request.remaining)
      variants.push(withChoice({ ...base, count }, withinModel.join('/'), request.optionId, index))
      remaining -= count
      request.remaining -= count
      if (request.remaining === 0) requestAt += 1
    }
    if (remaining > 0 && !disposable) variants.push({ ...base, count: remaining })
  }
  for (; requestAt < requested.length; requestAt += 1) {
    const request = requested[requestAt]
    if (!request || request.remaining <= 0) continue
    const base = expand(modelId, repeating.definition, index, MAX_DEPTH, request.remaining, new Set(), 1)
    variants.push(withChoice(base, withinModel.join('/'), request.optionId, index))
  }
  const holder = repeating.path.slice(0, -1)
  const replaced = replaceAt(selection, holder, modelId, variants)
  // Arming a model this squad did not have yet puts a body in it, and the squad is
  // already as big as it is allowed to be. The body comes from one of its own — a
  // veteran puts down his bolt rifle to carry the heavy bolter — and never from a
  // model the data insists on, which is how the sergeant used to be squeezed out.
  const before = models.reduce((total, model) => total + (model.count ?? 1), 0)
  const after = variants.reduce((total, variant) => total + (variant.count ?? 1), 0)
  if (after > before) return spendBodies(replaced, holder, modelId, after - before, index)
  // And a body no longer needed goes back to the squadmate who lent it, so putting
  // a heavy bolter down leaves the unit the size the player asked for.
  if (after < before) return refundBodies(replaced, holder, modelId, before - after, index)
  return replaced
}

/** Bodies handed back to the squad, the inverse of one being spent to arm a carrier. */
function refundBodies(
  selection: Selection,
  groupPath: readonly string[],
  carrierId: string,
  spare: number,
  index: CatalogueIndex,
): Selection {
  let left = spare
  return updateSelection(selection, groupPath, (group) => {
    const given = new Map<string, number>()
    const takers = (group.selections ?? [])
      .filter((child) => child.id !== carrierId)
      .filter((child) => {
        const definition = index.definitions.get(child.id)
        return Boolean(definition) && resolve(definition!, index).type === 'model' && requiredCount(definition!, index) === 0
      })
      .toSorted((one, other) => (other.count ?? 1) - (one.count ?? 1))
    for (const taker of takers) {
      if (left <= 0) break
      const definition = index.definitions.get(taker.id)!
      const cap = maximumCount(definition, index)
      const room = cap === null ? left : Math.max(0, cap - (taker.count ?? 1))
      const give = Math.min(left, room)
      if (!give) continue
      given.set(taker.id, give)
      left -= give
    }
    return {
      ...group,
      selections: (group.selections ?? []).map((child) => {
        const give = given.get(child.id) ?? 0
        return give ? { ...child, count: (child.count ?? 1) + give } : child
      }),
    }
  })
}

function spendBodies(
  selection: Selection,
  groupPath: readonly string[],
  carrierId: string,
  wanted: number,
  index: CatalogueIndex,
): Selection {
  let left = wanted
  return updateSelection(selection, groupPath, (group) => {
    const spent = new Map<string, number>()
    const givers = (group.selections ?? [])
      .filter((child) => child.id !== carrierId)
      .filter((child) => {
        const definition = index.definitions.get(child.id)
        return Boolean(definition) && resolve(definition!, index).type === 'model' && requiredCount(definition!, index) === 0
      })
      .toSorted((one, other) => (other.count ?? 1) - (one.count ?? 1))
    for (const giver of givers) {
      if (left <= 0) break
      const take = Math.min(left, giver.count ?? 1)
      spent.set(giver.id, take)
      left -= take
    }
    return {
      ...group,
      selections: (group.selections ?? []).flatMap((child) => {
        const take = spent.get(child.id) ?? 0
        if (!take) return [child]
        const remaining = (child.count ?? 1) - take
        return remaining > 0 ? [{ ...child, count: remaining }] : []
      }),
    }
  })
}

function replaceAt(selection: Selection, path: readonly string[], id: string, replacements: readonly Selection[]): Selection {
  const [next, ...rest] = path
  if (next === undefined) {
    return { ...selection, selections: [...(selection.selections ?? []).filter((child) => child.id !== id), ...replacements] }
  }
  return {
    ...selection,
    selections: (selection.selections ?? []).map((child) => (child.id === next ? replaceAt(child, rest, id, replacements) : child)),
  }
}

function withoutSelectionAt(selection: Selection, path: readonly string[]): Selection {
  const [next, ...rest] = path
  if (next === undefined) return selection
  if (!rest.length) return { ...selection, selections: selection.selections?.filter((child) => child.id !== next) }
  return {
    ...selection,
    selections: selection.selections?.map((child) => (child.id === next ? withoutSelectionAt(child, rest) : child)),
  }
}

function at(selection: Selection, path: readonly string[]): Selection | null {
  const [next, ...rest] = path
  if (next === undefined) return selection
  const child = (selection.selections ?? []).find((candidate) => candidate.id === next)
  return child ? at(child, rest) : null
}

function allAt(selection: Selection, path: readonly string[]): Selection[] {
  const [next, ...rest] = path
  if (next === undefined) return [selection]
  return (selection.selections ?? []).filter((candidate) => candidate.id === next).flatMap((child) => allAt(child, rest))
}

/**
 * Fills every per-model group to the number of models holding it.
 *
 * A squad's weapons are collective — one number for the whole unit — so growing the
 * squad leaves them behind, and a ten-model squad ends up carrying five guns. The
 * group is always full: reducing one option means increasing another, which is what
 * "eight blasters and two carbines" means and what the data's per-model minimum
 * insists on. Anything a player has deliberately put in the group stays; only the
 * shortfall moves, and it goes to the option the data names as the default.
 */
function refit(selection: Selection, index: CatalogueIndex, carriers: number): Selection {
  const definition = index.definitions.get(selection.id)
  const target = definition ? resolve(definition, index) : undefined
  const held = target?.type === undefined ? carriers : Math.max(1, selection.count ?? 1)

  const children = (selection.selections ?? []).map((child) => {
    const childDefinition = index.definitions.get(child.id)
    const inner = childDefinition ? resolve(childDefinition, index) : undefined
    // A group of collective wargear: fill it, without disturbing what is chosen.
    // Only wargear — a group of models is what the squad's own size means, and
    // filling that would overrule the number of models asked for.
    if (inner?.type === undefined && (child.selections ?? []).length) {
      const options = childDefinition ? childrenOf(inner ?? { id: child.id }, index) : []
      const wargear = options.filter(
        (option) => isCollective(option.definition, index) && resolve(option.definition, index).type === 'upgrade',
      )
      // Only what the data insists every model carries. An optional group is a
      // choice for the player, and filling it puts points on a list nobody asked
      // for — the same reason `defaultSelection` leaves optional upgrades out.
      const need = childDefinition && wargear.length ? requiredCount(childDefinition, index) * held : 0
      const named = inner && 'defaultSelectionEntryId' in inner ? inner.defaultSelectionEntryId : undefined
      const filled = need > 0 ? fill(child, need, named, options, index) : child
      return refit(filled, index, held)
    }
    // A mandatory collective upgrade: one per model, as the data asks. Models are
    // excluded for the same reason groups of them are — how many bodies a squad
    // fields is the squad's size, and refitting it would overrule the size asked for.
    if (childDefinition && isCollective(childDefinition, index) && inner?.type === 'upgrade') {
      const need = requiredCount(childDefinition, index) * held
      return refit(need > 0 ? { ...child, count: need } : child, index, held)
    }
    return refit(child, index, held)
  })

  return children.length ? { ...selection, selections: children } : selection
}

/**
 * Moves a group's shortfall onto its default option, or its excess off the largest.
 *
 * The default is the one the data names, and failing that the cheapest — the same
 * order `defaultSelection` fills a group in, and for the same reason: filling with
 * the priciest option puts points on a list nobody asked for.
 */
function fill(group: Selection, room: number, defaultId: string | undefined, options: readonly Option[], index: CatalogueIndex): Selection {
  const held = group.selections ?? []
  const total = held.reduce((sum, option) => sum + (option.count ?? 0), 0)
  // Never trims: holding more than the minimum is the player's business, and only
  // the shortfall is this function's.
  if (total >= room || !held.length) return group

  const price = (selection: Selection) => {
    const option = options.find((candidate) => candidate.id === selection.id)
    return option ? pointsOf(option, index) : 0
  }
  const cheapest = held.toSorted((left, right) => price(left) - price(right))[0]
  const moving = held.find((option) => option.id === defaultId) ?? cheapest
  if (!moving) return group

  const adjusted = Math.max(0, (moving.count ?? 0) + (room - total))
  const filled: Selection[] = []
  for (const option of held) filled.push(option === moving ? { ...option, count: adjusted } : option)
  return { ...group, selections: filled }
}

export type Wargear = { name: string; count: number }

/**
 * What a unit is carrying, as a datasheet would list it: leaf upgrades with how
 * many of each, in the order the data holds them.
 *
 * Only leaves count. An upgrade holding other upgrades is a container the data
 * uses for grouping, and naming it alongside its contents would say the same
 * thing twice — "1x Bolt rifle" under "Ranged weapons" reads as two pieces of
 * wargear when the model has one.
 */
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
