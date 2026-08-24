/**
 * A unit as the player asked for it, built out of the catalogue.
 *
 * A saved list keeps the picks — this entry, this many models, these choices — and
 * this turns one of them back into a selection tree the evaluator can price. Handing
 * back the picks rather than the expanded selections is deliberate: re-pricing them
 * against the catalogue an instance currently holds is the honest answer when Games
 * Workshop changes points.
 *
 * The pieces this is assembled from live beside it: `expand.ts` builds the smallest
 * legal selection, `unitSize.ts` says how many models it fields, `unitChoices.ts`
 * says what the data still leaves to the player, and `unitSpread.ts` divides a squad
 * between the options it is offered.
 *
 * Pure, like the rest of `src/core`.
 */

import type { CatalogueIndex, Definition } from './catalogue'
import { childrenOf, isCollective, MAX_DEPTH, maximumCount, type Option, pointsOf, requiredCount, resolve } from './definitions'
import { evaluate, type Selection } from './evaluate'
import { defaultSelection, expand, withChoice } from './expand'
import { countAt, updateSelection, withCounts } from './selection'
import { type ChoiceOptions, type UnitChoice, unitChoices, type UnitToggle, unitToggles } from './unitChoices'
import { boundedGroups, modelCountOf, sizeOf, type UnitSize } from './unitSize'
import { withUnitChoice, withUnitSpread } from './unitSpread'

/**
 * What a player picked, in the form a saved list keeps.
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
  const chosen = Object.entries(choices ?? {})
    .toSorted(([left], [right]) => left.split('/').length - right.split('/').length)
    .reduce((tree, [key, optionId]) => withUnitChoice(tree, key, optionId, index), base)
  const fixedSizes = modelCompositionSizes(entryId, chosen, index, context)
  const requestedModels =
    models === undefined || !fixedSizes.length
      ? models
      : fixedSizes.reduce((nearest, size) => (Math.abs(size - models) < Math.abs(nearest - models) ? size : nearest))
  const composed =
    requestedModels === undefined
      ? chosen
      : withModelComposition(entryId, chosen, requestedModels, new Set(Object.keys(choices ?? {})), index, context)
  const measured = sizeOf(composed, index)
  const composedSize = fixedSizes.length ? { ...measured, min: fixedSizes[0]!, max: fixedSizes.at(-1)!, options: fixedSizes } : measured
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

  if (requestedModels === undefined || !size.path.length || requestedModels === size.models) {
    const fitted = refit(toggled, index, 1)
    return finishUnit(entryId, fitted, size, index, context)
  }

  const wanted = Math.min(Math.max(requestedModels, size.min), size.max)
  const current = countAt(toggled, size.path)
  const resized = withCounts(toggled, [{ path: size.path, count: Math.max(0, current + (wanted - size.models)) }])
  const selection = refit(resized, index, 1)
  return finishUnit(entryId, selection, { ...size, models: wanted }, index, context)
}

/** Fixed model-count alternatives offered by a unit-composition choice. */
function modelCompositionSizes(entryId: string, selection: Selection, index: CatalogueIndex, context?: ChoiceOptions): number[] {
  const current = modelCountOf(selection, index)
  for (const choice of unitChoices(entryId, selection, index, context)) {
    if (choice.name.trim().toLocaleLowerCase() !== 'unit composition' || choice.room !== 1 || choice.options.length < 2) continue
    const counts = [current, ...choice.options.map((option) => modelCountOf(withChoice(selection, choice.key, option.id, index), index))]
    const sizes = [...new Set(counts)].toSorted((left, right) => left - right)
    if (sizes.length > 1) return sizes
  }
  return []
}

function finishUnit(entryId: string, selection: Selection, size: UnitSize, index: CatalogueIndex, context?: BuildContext): BuiltUnit {
  const choices = unitChoices(entryId, selection, index, context)
  const completed = choices.reduce((tree, choice) => {
    const path = choice.key.split('/')
    const group = index.definitions.get(path.at(-1) ?? '')
    const named = group && 'defaultSelectionEntryId' in group ? group.defaultSelectionEntryId : undefined
    const option =
      choice.options.find((candidate) => candidate.id === named) ?? choice.options.toSorted((left, right) => left.points - right.points)[0]
    const selectedLoadout = path.slice(0, -1).some((id, at) => {
      const definition = index.definitions.get(id)
      return definition && resolve(definition, index).type === 'upgrade' && countAt(selection, path.slice(0, at + 1)) > 0
    })
    const missingRequired =
      selectedLoadout &&
      !choice.optional &&
      choice.room === 1 &&
      option?.points === 0 &&
      choice.options.every((candidate) => candidate.count === 0)
    const defaultedComposition =
      choice.name.trim().toLowerCase() === 'unit composition' && choice.optional && choice.options.length === 1 && option?.points === 0
    if ((!missingRequired && !defaultedComposition) || !option || context?.spreads?.[choice.key] !== undefined) return tree
    return withUnitSpread(tree, choice.key, { [option.id]: defaultedComposition ? option.max : 1 }, index)
  }, selection)
  /**
   * A squad the data keeps identical, not split by the building of it.
   *
   * Growing a squad of tesla carbines refills the new bodies from the group's default,
   * which would mix what the datasheet does not allow mixed — nobody asked for that, so
   * the models that arrived take what the rest are holding.
   *
   * A split the list itself states is left exactly as it states it. A roster pasted in
   * from somewhere else is the player's, illegal or not, and `violations` is already
   * where it gets told that its Immortals may not carry both. Quietly issuing seven of
   * them a different gun would be a worse answer than saying so.
   */
  const settled = unitChoices(entryId, completed, index, context).reduce((tree, choice) => {
    const held = choice.options.filter((option) => option.count > 0)
    const asked = context?.spreads?.[choice.key] ?? {}
    const stated = choice.options.filter((option) => (asked[option.id] ?? 0) > 0)
    if (!choice.uniform || held.length < 2 || stated.length > 1) return tree
    const chosen = stated[0] ?? held.toSorted((one, other) => other.count - one.count)[0]
    if (!chosen) return tree
    return withUnitSpread(
      tree,
      choice.key,
      Object.fromEntries(choice.options.map((option) => [option.id, option.id === chosen.id ? choice.room : 0])),
      index,
    )
  }, completed)

  return {
    selection: settled,
    size,
    choices: unitChoices(entryId, settled, index, context),
    toggles: unitToggles(entryId, settled, index, context),
  }
}

/** Picks a fixed composition whose expanded models exactly match the requested size. */
function withModelComposition(
  entryId: string,
  selection: Selection,
  models: number,
  explicit: ReadonlySet<string>,
  index: CatalogueIndex,
  context?: ChoiceOptions,
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
  const groups = boundedGroups(selection, index)
  if (!groups.length) return selection
  const overrides = groups.map((group) => ({ path: group.adjust, count: countAt(selection, group.adjust) * factor }))
  if (overrides.some((override, position) => override.count > groups[position]!.max)) return selection
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
  return { ...group, selections: held.map((option) => (option === moving ? { ...option, count: adjusted } : option)) }
}
