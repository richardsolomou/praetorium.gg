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
import { hiddenByRules } from './evaluate'
import type { Selection } from './evaluate'

/** Crusade and campaign subtrees run deep and none of it is mandatory. */
const MAX_DEPTH = 4

export type DefaultOptions = { maxDepth?: number }

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
  /** Optional single entries such as Warlord, keyed by their catalogue path. */
  toggles?: Record<string, number>
  /** The position of the unit this one joins in the saved pick list. */
  attachedTo?: number
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
  return expand(entryId, definition, index, options.maxDepth ?? MAX_DEPTH, 1, new Set(), 1)
}

function expand(
  id: string,
  definition: Definition,
  index: CatalogueIndex,
  depth: number,
  count: number,
  seen: Set<string>,
  carriers: number,
): Selection {
  const target = resolve(definition, index)
  if (depth <= 0 || seen.has(target.id)) return { id, count }

  const visited = new Set(seen).add(target.id)
  const options = childrenOf(target, index).filter((child) => !child.definition.hidden)

  // A group holds no count of its own: "at least four selections of this group"
  // is satisfied by what goes inside it, so the requirement passes to a child.
  // Putting the number on the group itself leaves the group empty, which reads as
  // a squad with no models in it.
  if (target.type === undefined) {
    // Spread the requirement across what the group offers, respecting each
    // option's own cap: two selections from a group of one-each choices means one
    // of two things, not two of one.
    const inside: Selection[] = []
    let remaining = count
    for (const child of ordered(target, options, index)) {
      const scale = scaleOf(child.definition, index, carriers)
      const cap = maximumCount(child.definition, index)
      const room = cap === null ? null : cap * scale
      const share = remaining > 0 ? (room === null ? remaining : Math.min(remaining, room)) : 0
      // A child's own minimum applies whatever the group asks for, so a group with
      // no requirement still yields what its contents demand.
      const take = Math.max(share, requiredCount(child.definition, index) * scale)
      if (take <= 0 && resolve(child.definition, index).type === undefined) {
        const built = expand(child.id, child.definition, index, depth - 1, 0, visited, carriers)
        if (built.selections?.length) inside.push(built)
        continue
      }
      if (take <= 0) continue
      inside.push(expand(child.id, child.definition, index, depth - 1, take, visited, carriers))
      remaining -= Math.min(remaining, take)
    }
    return inside.length ? { id, count: 1, selections: inside } : { id, count: 1 }
  }

  const children: Selection[] = []
  // What this entry holds is held by `count` of it, which is what a per-model
  // requirement inside is counted against.
  const held = Math.max(1, count)
  for (const child of options) {
    const required = requiredCount(child.definition, index) * scaleOf(child.definition, index, held)
    if (resolve(child.definition, index).type === undefined) {
      // Always look inside a group. One with no minimum of its own can still hold
      // entries that insist on themselves — which is how most squads are written —
      // and skipping it leaves the unit with a sergeant and nobody to lead.
      const built = expand(child.id, child.definition, index, depth - 1, required, visited, held)
      if (built.selections?.length) children.push(built)
      continue
    }
    if (required <= 0) continue
    children.push(expand(child.id, child.definition, index, depth - 1, required, visited, held))
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
function maximumCount(definition: Definition, index: CatalogueIndex): number | null {
  const target = resolve(definition, index)
  const constraints = [...(definition.constraints ?? []), ...(target === definition ? [] : (target.constraints ?? []))]
  const caps = constraints
    .filter((constraint) => constraint.type === 'max' && constraint.field === 'selections' && !constraint.percentValue)
    .map((constraint) => constraint.value)
    .filter((value) => value >= 0)
  return caps.length ? Math.min(...caps) : null
}

/** How many of this child the data insists on: its own minimum, or a group's. */
function requiredCount(definition: Definition, index: CatalogueIndex): number {
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
export type UnitSize = { min: number; max: number; models: number; path: string[] }

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

export type UnitToggle = { key: string; name: string; selected: boolean }
export type BuiltUnit = { selection: Selection; size: UnitSize; choices: UnitChoice[]; toggles: UnitToggle[] }

/** The unit as the data hands it over, with the player's choices taken and resized to `models`. */
export function buildUnit(
  entryId: string,
  index: CatalogueIndex,
  models?: number,
  choices?: Readonly<Record<string, string>>,
  context?: {
    primaryCatalogueId?: string
    roster?: readonly Selection[]
    spreads?: Readonly<Record<string, Record<string, number>>>
    toggles?: Readonly<Record<string, number>>
  },
): BuiltUnit | null {
  const base = defaultSelection(entryId, index)
  if (!base) return null

  // Choices first: an option can bring its own bodies, so sizing has to see them.
  const chosen = Object.entries(choices ?? {}).reduce((tree, [key, optionId]) => withChoice(tree, key, optionId, index), base)
  const composed =
    models === undefined ? chosen : withModelComposition(entryId, chosen, models, new Set(Object.keys(choices ?? {})), index, context)
  // Then the spreads, which say how many of each option rather than which one.
  const spread = Object.entries(context?.spreads ?? {}).reduce((tree, [key, counts]) => withSpread(tree, key, counts), composed)
  const toggled = withCounts(
    spread,
    Object.entries(context?.toggles ?? {}).map(([key, count]) => ({ path: key.split('/'), count })),
  )

  const size = sizeOf(toggled, index)
  if (models === undefined || !size.path.length || models === size.models) {
    const fitted = refit(toggled, index, 1)
    return { selection: fitted, size, choices: unitChoices(entryId, fitted, index, context), toggles: unitToggles(entryId, fitted, index) }
  }

  const wanted = Math.min(Math.max(models, size.min), size.max)
  const current = countAt(toggled, size.path)
  const resized = withCounts(toggled, [{ path: size.path, count: Math.max(0, current + (wanted - size.models)) }])
  const selection = refit(resized, index, 1)
  return {
    selection,
    size: { ...size, models: wanted },
    choices: unitChoices(entryId, selection, index, context),
    toggles: unitToggles(entryId, selection, index),
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
      if ((inner.name ?? child.definition.name)?.trim().toLowerCase() === 'warlord') {
        found.push({ key: here.join('/'), name: 'Warlord', selected: (at(selection, here)?.count ?? 0) > 0 })
      } else walk(child.definition, here, visited)
    }
  }
  walk(root, [], new Set())
  return found
}

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
export type UnitChoice = {
  /** Path to the group holding the options, as a `/`-joined key the caller can round-trip. */
  key: string
  name: string
  /** Empty when nothing is taken, which an optional group starts out as. */
  chosen: string
  /** An enhancement is a choice a list may simply decline, so it needs a way to say no. */
  optional: boolean
  /**
   * How many selections the group may hold at once.
   *
   * One is an either-or: a captain's relic blade or his power sword. More than one
   * is a squad dividing itself, and the two want different controls — a choice of
   * one, against a count against each option.
   */
  room: number
  options: { id: string; name: string; points: number; count: number }[]
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

      if (inner.type === undefined) {
        const choosable = childrenOf(inner, index).filter(
          (option) => visible(option.definition) && resolve(option.definition, index).type !== undefined,
        )
        const scale = scaleOf(child.definition, index, carriers)
        const capacity = maximumCount(child.definition, index)
        const room = capacity === null ? occupantRoom(choosable, index) : capacity * scale
        if (choosable.length > 1 && room >= 1 && room !== UNBOUNDED) {
          const group = at(selection, here)
          const held = group?.selections ?? []
          const taken = held.find((present) => (present.count ?? 1) > 0 && choosable.some((option) => option.id === present.id))
          choices.push({
            key: here.join('/'),
            name: inner.name ?? 'Choice',
            chosen: taken?.id ?? '',
            optional: requiredCount(child.definition, index) === 0,
            room,
            options: choosable.map((option) => ({
              id: option.id,
              name: resolve(option.definition, index).name ?? option.id,
              points: pointsOf(option, index),
              count: held.find((present) => present.id === option.id)?.count ?? 0,
            })),
          })
        }
      }

      // What is inside an entry is held by however many of it the selection holds.
      walk(child.definition, here, left - 1, visited, inner.type === undefined ? carriers : (at(selection, here)?.count ?? 1))
    }
  }

  walk(entry, [], depth, new Set(), 1)
  return choices
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

function at(selection: Selection, path: readonly string[]): Selection | null {
  const [next, ...rest] = path
  if (next === undefined) return selection
  const child = (selection.selections ?? []).find((candidate) => candidate.id === next)
  return child ? at(child, rest) : null
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
      if (kind === 'upgrade' && !grandchildren.length) {
        const name = (definition && resolve(definition, index).name) ?? definition?.name
        if (name) found.set(name, (found.get(name) ?? 0) + count)
      }
      if (depth < MAX_DEPTH) walk(child, depth + 1, count)
    }
  }

  walk(selection, 0, 1)
  return [...found].map(([name, count]) => ({ name, count }))
}
