/**
 * Dividing a squad between the options it is offered.
 *
 * "Eight keep the gauss blaster, two take tesla carbines" is one group holding two
 * things at once, which a single chosen id cannot say. Every function here answers a
 * request of that shape, and the hard part is never the counts — it is that arming a
 * model is often the same act as putting that model in the squad, so the squad has to
 * come out the size the player set it to.
 */

import type { CatalogueIndex, Definition } from './catalogue'
import { isCollectiveGroup, storesUnitTotal } from './collective'
import {
  childrenOf,
  hasMutableMinimum,
  MAX_DEPTH,
  maximumCount,
  maximumCountAt,
  repeatedCarrierOn,
  repeatedModelOn,
  replacesSquadmate,
  requiredCount,
  resolve,
  UNBOUNDED,
} from './definitions'
import { type EvaluateOptions, type Selection, selectionCountBoundsAt } from './evaluate'
import { expand, withChoice } from './expand'
import { allAt, at, countAt, replaceAt, updateSelection, withCounts, withoutSelectionAt, withPlaceFor, withSpread } from './selection'
import { modelCountOf, sizeOf } from './unitSize'

export function withUnitSpread(
  selection: Selection,
  key: string,
  counts: Readonly<Record<string, number>>,
  index: CatalogueIndex,
  options: EvaluateOptions = {},
): Selection {
  const path = key.split('/')
  const groupId = path.at(-1)
  const group = groupId ? index.definitions.get(groupId) : undefined
  const occupants = group ? childrenOf(resolve(group, index), index) : []
  if (group && occupants.some((option) => resolve(option.definition, index).type === 'model')) {
    const kept = keepingTheSquad(selection, withModelOccupants(selection, path, counts, group, occupants, index, options), path, index)
    return keepingReplacedSquadmates(selection, kept, path, index)
  }

  const repeatedEntry = repeatedModelOn(path.slice(0, -1), index)
  const entry = group ? resolve(group, index) : undefined
  // A specialist the datasheet holds outside any group, as the Sanctifiers hold theirs.
  if (entry?.type === 'model' && groupId) {
    const count = counts[groupId] ?? 0
    const placed = count
      ? updateSelection(withCounts(selection, [{ path, count }]), path, () =>
          expand(groupId, group!, index, MAX_DEPTH, count, new Set(), 1),
        )
      : withoutSelectionAt(selection, path)
    return keepingReplacedSquadmates(selection, placed, path.slice(0, -1), index)
  }
  if (repeatedEntry && entry?.type === 'upgrade' && groupId) {
    return spreadRepeatedUpgrade(selection, path, counts[groupId] ?? 0, repeatedEntry, index)
  }
  if (entry?.type === 'upgrade' && groupId) {
    return withCounts(selection, [{ path, count: counts[groupId] ?? 0 }])
  }

  const repeating = repeatedCarrierOn(path, index) ?? splitCarrierOf(selection, path, group, index)
  if (!repeating)
    return group
      ? keepingTheSquad(selection, spreadOptions(selection, path, counts, group, index), path, index)
      : withSpread(selection, key, counts)

  // A group each model takes more than one pick from, such as a Crisis suit's two weapons, fills a model at a time.
  if (group && (maximumCount(group, index) ?? UNBOUNDED) > 1) {
    return spreadIndependentRepeatedGroup(selection, path, counts, repeating, group, index, options)
  }
  return spreadRepeatedGroup(selection, path, counts, repeating, index, options)
}

export function withUnitChoice(
  selection: Selection,
  key: string,
  optionId: string,
  index: CatalogueIndex,
  options: EvaluateOptions = {},
): Selection {
  const path = key.split('/')
  const id = path.at(-1)
  const definition = id ? index.definitions.get(id) : undefined
  // A specialist the datasheet holds outside any group is taken or not, as its own count.
  if (id && definition && resolve(definition, index).type === 'model') {
    return withUnitSpread(selection, key, { [id]: optionId === id ? 1 : 0 }, index, options)
  }
  const carrier = withExpandedCarrier(selection, path, index)
  if (!selectedCarriers(carrier, path, index)) return selection
  const chosen = withChoice(carrier, key, optionId, index, options)
  return keepingReplacedSquadmates(selection, keepingTheSquad(selection, chosen, path, index), path, index)
}

/**
 * A model another spread has already divided, as Death Company Marines given different pistols
 * are, carrying a group whose options count for the whole squad: each part takes its own share.
 */
function splitCarrierOf(selection: Selection, path: readonly string[], group: Definition | undefined, index: CatalogueIndex) {
  if (!group || !isCollectiveGroup(group, index)) return null
  const modelPath = path.slice(0, -1)
  const definition = index.definitions.get(modelPath.at(-1) ?? '')
  if (!definition || resolve(definition, index).type !== 'model' || allAt(selection, modelPath).length < 2) return null
  return { path: [...modelPath], definition }
}

/** Expand each spread option so required descendants and their rules survive. */
function spreadOptions(
  selection: Selection,
  path: readonly string[],
  counts: Readonly<Record<string, number>>,
  group: Definition,
  index: CatalogueIndex,
): Selection {
  const requested = new Set(Object.keys(counts))
  const occupants = childrenOf(resolve(group, index), index)
  const byId = new Map(occupants.map((option) => [option.id, option]))
  const asking = Object.values(counts).some((count) => count > 0)
  const carrier = asking ? withExpandedCarrier(selection, path, index) : selection
  if (!selectedCarriers(carrier, path, index)) return selection
  const holder = at(carrier, path.slice(0, -1))
  const holderDefinition = holder && index.definitions.get(holder.id)
  // A shared capacity asked for more than its models can carry, as a saved split outlives
  // the Scions a specialist replaced, holds what they can.
  const carriers =
    isCollectiveGroup(group, index) && holderDefinition && resolve(holderDefinition, index).type === 'model' ? (holder.count ?? 1) : null
  return updateSelection(withPlaceFor(carrier, path), path, (held) => {
    const spread = {
      ...held,
      selections: [
        ...(held.selections ?? []).filter((child) => !requested.has(child.id)),
        ...Object.entries(counts).flatMap(([optionId, count]) => {
          const option = byId.get(optionId)
          return option && count > 0 ? [expand(option.id, option.definition, index, MAX_DEPTH, count, new Set(), 1)] : []
        }),
      ],
    }
    return carriers === null ? spread : withinGroupCapacity(spread, group, carriers, index)
  })
}

function withExpandedCarrier(selection: Selection, path: readonly string[], index: CatalogueIndex) {
  for (let length = path.length - 1; length > 0; length--) {
    const carrierPath = path.slice(0, length)
    if (at(selection, carrierPath)) break
    const id = carrierPath.at(-1)
    const definition = id ? index.definitions.get(id) : undefined
    if (!id || !definition || resolve(definition, index).type !== 'model') continue
    const parent = carrierPath.slice(0, -1)
    return replaceAt(withPlaceFor(selection, parent), parent, id, [expand(id, definition, index, MAX_DEPTH, 1, new Set(), 1)])
  }
  return selection
}

function selectedCarriers(selection: Selection, path: readonly string[], index: CatalogueIndex) {
  for (let length = 1; length < path.length; length++) {
    const carrierPath = path.slice(0, length)
    const id = carrierPath.at(-1)
    const definition = id ? index.definitions.get(id) : undefined
    if (definition && resolve(definition, index).type !== undefined && !at(selection, carrierPath)) return false
  }
  return true
}

/**
 * A group of models set to the counts asked for, and only those.
 *
 * Rebuilding the whole group from the request would drop the models it says nothing
 * about — a squad told how many bolt rifles it wants is not saying it has no sergeant.
 */
function withModelOccupants(
  selection: Selection,
  path: readonly string[],
  counts: Readonly<Record<string, number>>,
  group: Definition,
  occupants: readonly { id: string; definition: Definition }[],
  index: CatalogueIndex,
  options: EvaluateOptions,
): Selection {
  const optionIds = new Set(Object.keys(counts))
  const capacity = maximumCountAt(selection, path, group, index, options)
  const asking = Object.values(counts).some((count) => count > 0)
  const carrier = asking ? withExpandedCarrier(selection, path, index) : selection
  if (!selectedCarriers(carrier, path, index)) return selection
  return updateSelection(asking ? withPlaceFor(carrier, path) : carrier, path, (held) => {
    // A saved list can ask for more bodies than the squad has, either because the
    // catalogue's limits moved under it or because two of its own requests
    // disagree. The group's own maximum is the answer, and the models it says
    // nothing about are counted first because they are already standing there.
    const untouched = (held.selections ?? []).filter((child) => !optionIds.has(child.id))
    const defaultId = 'defaultSelectionEntryId' in group ? group.defaultSelectionEntryId : undefined
    // A specialist the counts name takes the place of a model they leave out — the
    // group's default, or else one the squad must field — down to that model's minimum.
    const minimum = (child: Selection) => {
      const definition = index.definitions.get(child.id)
      return definition && resolve(definition, index).type === 'model' ? requiredCount(definition, index, options) : null
    }
    const filler =
      untouched.find((child) => child.id === defaultId && minimum(child) !== null) ?? untouched.find((child) => (minimum(child) ?? 0) > 0)
    // A per-model upgrade splits the filler into copies, so its minimum is over all of them;
    // bodies leave the plainest copies first, so the upgrade a player chose stays.
    const fillers = filler
      ? untouched
          .filter((child) => child.id === filler.id)
          .toSorted((one, other) => (one.selections?.length ?? 0) - (other.selections?.length ?? 0))
      : []
    // Its minimum is read with the specialists standing, since taking one can lower it.
    const asked = withCounts(
      selection,
      Object.entries(counts).map(([id, count]) => ({ path: [...path, id], count })),
    )
    const floor = filler ? (selectionCountBoundsAt(asked, [...path, filler.id], index, options)?.minimum ?? minimum(filler) ?? 0) : 0
    const spare = filler ? Math.max(0, fillers.reduce((total, child) => total + (child.count ?? 1), 0) - floor) : 0
    const free =
      capacity === null || capacity === UNBOUNDED
        ? Number.POSITIVE_INFINITY
        : Math.max(0, capacity - untouched.reduce((total, child) => total + (child.count ?? 1), 0))
    let left = free + spare
    const allocated = new Map<string, number>()
    for (const option of occupants
      .filter((candidate) => Object.hasOwn(counts, candidate.id))
      .toSorted((one, other) => Number(one.id === defaultId) - Number(other.id === defaultId))) {
      const count = Math.min(counts[option.id] ?? 0, left)
      allocated.set(option.id, count)
      left -= count
    }
    let taken = Math.max(0, [...allocated.values()].reduce((total, count) => total + count, 0) - free)
    const remaining = new Map<Selection, number>()
    for (const child of fillers) {
      const removed = Math.min(child.count ?? 1, taken)
      remaining.set(child, (child.count ?? 1) - removed)
      taken -= removed
    }
    return {
      ...held,
      selections: [
        ...untouched.flatMap((child) => {
          const count = remaining.get(child)
          if (count === undefined || count === (child.count ?? 1)) return [child]
          return count > 0 ? [withFewerModels(child, count, index)] : []
        }),
        ...occupants.flatMap((option) => standing(held.selections ?? [], option, allocated.get(option.id) ?? 0, index)),
      ],
    }
  })
}

/**
 * An option's models at the count asked for, keeping each one already standing that
 * still fits, so a heavy weapon chosen for its model survives a spread that counts it.
 * Only whole selections are kept: one holding a unit total cannot be cut down.
 */
function standing(present: readonly Selection[], option: { id: string; definition: Definition }, count: number, index: CatalogueIndex) {
  const kept: Selection[] = []
  let left = count
  for (const child of present) {
    if (child.id !== option.id || (child.count ?? 1) > left) continue
    kept.push(child)
    left -= child.count ?? 1
  }
  return left > 0 ? [...kept, expand(option.id, option.definition, index, MAX_DEPTH, left, new Set(), 1)] : kept
}

/**
 * Some of a model selection's bodies, from `offset`, as a selection of their own. A count the
 * selection stores for all its bodies, as a squad's collective chainswords are, is shared out
 * rather than copied, so splitting five marines by pistol still leaves five chainswords.
 */
function part(model: Selection, offset: number, count: number, index: CatalogueIndex): Selection {
  const bodies = model.count ?? 1
  if (offset === 0 && count === bodies) return model
  const share = (total: number) => Math.floor((total * (offset + count)) / bodies) - Math.floor((total * offset) / bodies)
  const within = (node: Selection): Selection => {
    if (!node.selections) return node
    const holder = index.definitions.get(node.id)
    return {
      ...node,
      selections: node.selections.flatMap((child) => {
        const definition = index.definitions.get(child.id)
        if (!definition || resolve(definition, index).type === 'model') return [child]
        if (!storesUnitTotal(definition, holder, index)) return [within(child)]
        const held = share(child.count ?? 1)
        return held > 0 ? [{ ...child, count: held }] : []
      }),
    }
  }
  return { ...within(model), count }
}

function spreadRepeatedUpgrade(
  selection: Selection,
  path: readonly string[],
  requested: number,
  repeating: { path: string[] },
  index: CatalogueIndex,
) {
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
    if (taking) variants.push(withCounts(part(base, 0, taking, index), [{ path: withinModel, count: 1 }]))
    if (taking < count) variants.push(part(base, taking, count - taking, index))
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
  options: EvaluateOptions,
) {
  const modelId = repeating.path.at(-1)
  if (!modelId) return selection
  const withinModel = path.slice(repeating.path.length)
  const models = allAt(selection, repeating.path)
  // A model the squad took on only to carry this weapon — one the data does not
  // insist on, holding a group it does insist on — has no reason to stay once the
  // weapon is put down. Shieldvanes are the other case: the models were always
  // there and the upgrade is what is optional, so an unequipped one has to remain.
  const group = index.definitions.get(path.at(-1) ?? '')
  // The model the unit's size counts is never optional, even when its group, not the
  // model, states how many there are: "2-5 Bullgryns" holds the Bullgryn's count.
  const sizing = sizeOf(selection, index).path.join('/') === repeating.path.join('/')
  const optionalCarrier =
    !sizing && requiredCount(repeating.definition, index, { ...options, roster: [...(options.roster ?? []), selection] }) === 0
  const mandatory = Boolean(group) && requiredCount(group!, index) > 0
  const disposable = optionalCarrier && mandatory
  const inner = group ? resolve(group, index) : undefined
  const defaultId = mandatory && inner && 'defaultSelectionEntryId' in inner ? inner.defaultSelectionEntryId : undefined
  // A squad that cannot grow to fit the request, such as one just made smaller, gives
  // up the default before any option the player chose.
  const bodies = models.reduce((total, model) => total + (model.count ?? 1), 0)
  const excess = optionalCarrier ? 0 : Object.values(counts).reduce((total, count) => total + Math.max(0, count), 0) - bodies
  const requested = Object.entries(counts)
    .map(([optionId, count]) => ({ optionId, remaining: optionId === defaultId && excess > 0 ? count - excess : count }))
    .filter((request) => request.remaining > 0)
  // A body a request leaves over, as one the squad has just grown by, keeps what the
  // data gives every model; a request for none of the options puts them all down.
  const unassigned = (base: Selection, offset: number, count: number) =>
    defaultId && requested.length
      ? withChoice(part(base, offset, count, index), withinModel.join('/'), defaultId, index)
      : part(base, offset, count, index)
  const variants: Selection[] = []
  let requestAt = 0

  for (const model of models) {
    const base = withoutSelectionAt(model, withinModel)
    let remaining = model.count ?? 1
    while (remaining > 0 && requestAt < requested.length) {
      const request = requested[requestAt]
      if (!request) break
      const count = Math.min(remaining, request.remaining)
      variants.push(withChoice(part(base, (model.count ?? 1) - remaining, count, index), withinModel.join('/'), request.optionId, index))
      remaining -= count
      request.remaining -= count
      if (request.remaining === 0) requestAt += 1
    }
    if (remaining > 0 && !disposable) variants.push(unassigned(base, (model.count ?? 1) - remaining, remaining))
  }
  for (; requestAt < requested.length; requestAt += 1) {
    if (!optionalCarrier) break
    const request = requested[requestAt]
    if (!request || request.remaining <= 0) continue
    const base = expand(modelId, repeating.definition, index, MAX_DEPTH, request.remaining, new Set(), 1)
    variants.push(withChoice(base, withinModel.join('/'), request.optionId, index))
  }
  const holder = repeating.path.slice(0, -1)
  // The carrier can be as absent as the group it holds — a squad arming its first
  // flamer has neither the flamer nor the biker to hang it on — so the group the
  // carrier stands in needs its place made before the carrier can be put there.
  const replaced = replaceAt(requested.length ? withPlaceFor(selection, holder) : selection, holder, modelId, variants)
  // Arming a model this squad did not have yet puts a body in it, and the squad is
  // already as big as it is allowed to be. The body comes from one of its own — a
  // veteran puts down his bolt rifle to carry the heavy bolter — and never from a
  // model the data insists on, such as the sergeant.
  const before = models.reduce((total, model) => total + (model.count ?? 1), 0)
  const after = variants.reduce((total, variant) => total + (variant.count ?? 1), 0)
  // The squadmate may stand a group further out than the carrier does, where the
  // catalogue files its specialists apart from the squad they are drawn from, so what
  // the holder cannot pay for is asked of the squad around it.
  if (after > before) return keepingTheSquad(selection, spendBodies(replaced, holder, modelId, after - before, index), path, index)
  // And a body no longer needed goes back to the squadmate who lent it, so putting
  // a heavy bolter down leaves the unit the size the player asked for.
  if (after < before) return keepingTheSquad(selection, refundBodies(replaced, holder, modelId, before - after, index), path, index)
  return replaced
}

function spreadIndependentRepeatedGroup(
  selection: Selection,
  path: readonly string[],
  counts: Readonly<Record<string, number>>,
  repeating: { path: string[] },
  group: Definition,
  index: CatalogueIndex,
  evaluation: EvaluateOptions,
) {
  const modelId = repeating.path.at(-1)
  if (!modelId) return selection
  const withinModel = path.slice(repeating.path.length)
  const options = childrenOf(resolve(group, index), index).filter(
    (option) => requiredCount(option.definition, index) === 0 || hasMutableMinimum(option.definition, index),
  )
  const optionIds = new Set(options.map((option) => option.id))
  let variants = allAt(selection, repeating.path).map((model) =>
    updateSelection(withPlaceFor(model, withinModel), withinModel, (held) => ({
      ...held,
      selections: held.selections?.filter((child) => !optionIds.has(child.id)),
    })),
  )
  const carriers = variants.reduce((total, model) => total + (model.count ?? 1), 0)
  const picks = maximumCount(group, index) ?? UNBOUNDED
  const picked = (model: Selection) =>
    (at(model, withinModel)?.selections ?? []).reduce((total, child) => total + (optionIds.has(child.id) ? (child.count ?? 1) : 0), 0)

  for (const option of options) {
    // A limit can depend on the unit, as a Gun Drone's does, so it is read where the option would stand.
    const limit =
      selectionCountBoundsAt(selection, [...path, option.id], index, evaluation)?.maximum ?? maximumCount(option.definition, index)
    const most = Math.max(1, limit ?? 1)
    let remaining = Math.min(Math.max(0, counts[option.id] ?? 0), carriers * most)
    const equipped: Selection[] = []
    for (const model of variants) {
      const modelCount = model.count ?? 1
      const capacity = Math.min(most, picks - picked(model))
      if (capacity <= 0) {
        equipped.push(model)
        continue
      }
      const full = Math.min(modelCount, Math.floor(remaining / capacity))
      if (full > 0) equipped.push(withIndependentOption(part(model, 0, full, index), withinModel, option, capacity, index))
      remaining -= full * capacity

      const partial = remaining > 0 && full < modelCount ? remaining : 0
      if (partial > 0) equipped.push(withIndependentOption(part(model, full, 1, index), withinModel, option, partial, index))
      if (partial > 0) remaining = 0

      const untouched = modelCount - full - Number(partial > 0)
      if (untouched > 0) equipped.push(part(model, modelCount - untouched, untouched, index))
    }
    variants = equipped
  }

  return replaceAt(selection, repeating.path.slice(0, -1), modelId, combineIdentical(variants))
}

function withIndependentOption(
  model: Selection,
  path: readonly string[],
  option: { id: string; definition: Definition },
  count: number,
  index: CatalogueIndex,
) {
  return updateSelection(withPlaceFor(model, path), path, (held) => ({
    ...held,
    selections: [
      ...(held.selections ?? []).filter((child) => child.id !== option.id),
      expand(option.id, option.definition, index, MAX_DEPTH, count, new Set(), 1),
    ],
  }))
}

function combineIdentical(selections: readonly Selection[]) {
  const combined = new Map<string, Selection>()
  for (const selection of selections) {
    const signature = JSON.stringify({ id: selection.id, selections: selection.selections })
    const existing = combined.get(signature)
    combined.set(signature, existing ? { ...existing, count: (existing.count ?? 1) + (selection.count ?? 1) } : selection)
  }
  return [...combined.values()]
}

/** A weapon swap inside the squad’s size group replaces a model rather than growing the squad; models outside that group remain additions. */
function keepingTheSquad(before: Selection, after: Selection, path: readonly string[], index: CatalogueIndex): Selection {
  const sized = sizeOf(before, index).path.slice(0, -1)
  const inside = sized.length > 0 && path.length > sized.length && sized.every((step, depth) => path[depth] === step)
  if (!inside) return sized.length ? after : keepingAFullGroup(before, after, path, index)
  const squad = sized
  const fielded = (tree: Selection) => {
    const held = at(tree, squad)
    return held ? modelCountOf(held, index) : 0
  }
  const grew = fielded(after) - fielded(before)
  const carrier = path[squad.length] ?? ''
  if (grew > 0) return spendBodies(after, squad, carrier, grew, index)
  if (grew < 0) return refundBodies(after, squad, carrier, -grew, index)
  return after
}

/**
 * A unit of fixed size has no squad to resize, but a specialist group nested in a full
 * group of models, as a Pathfinder Team's rail rifles sit inside its nine Pathfinders,
 * still takes its bodies from the models around it.
 */
function keepingAFullGroup(before: Selection, after: Selection, path: readonly string[], index: CatalogueIndex): Selection {
  for (let depth = path.length - 2; depth >= 0; depth--) {
    const group = index.definitions.get(path[depth]!)
    if (!group || resolve(group, index).type !== undefined) continue
    const most = maximumCount(group, index)
    const held = at(after, path.slice(0, depth + 1))
    const over = most === null || !held ? 0 : modelCountOf(held, index) - most
    const grew =
      over > 0 ? Math.min(over, modelCountOf(held!, index) - modelCountOf(at(before, path.slice(0, depth + 1)) ?? held!, index)) : 0
    // The squadmates' own minimums can depend on the specialists, as nine Pathfinders become six.
    const minimum = (giver: Selection) => selectionCountBoundsAt(after, [...path.slice(0, depth + 1), giver.id], index)?.minimum ?? 0
    return grew > 0 ? spendBodies(after, path.slice(0, depth + 1), path[depth + 1] ?? '', grew, index, minimum) : after
  }
  return after
}

/**
 * A specialist taking a squadmate's place lowers that squadmate's limits, as a Sanctifier
 * given the simulacrum imperialis lowers the hand-flamer Sanctifiers', so the body moves
 * between them and the squad keeps its size.
 */
function keepingReplacedSquadmates(before: Selection, after: Selection, path: readonly string[], index: CatalogueIndex): Selection {
  const groupPath = replacedSquadmatesPath(before, after, path, index)
  if (!groupPath) return after
  const fielded = (tree: Selection) => {
    const group = at(tree, groupPath)
    return group ? modelCountOf(group, index) : 0
  }
  const grew = fielded(after) - fielded(before)
  const bounds = (squadmate: Selection) => selectionCountBoundsAt(after, [...groupPath, squadmate.id], index)
  if (grew > 0) return spendBodies(after, groupPath, '', grew, index, (giver) => bounds(giver)?.maximum ?? giver.count ?? 1)
  if (grew < 0) return refundBodies(after, groupPath, '', -grew, index, (taker) => bounds(taker)?.minimum ?? 0)
  return after
}

/**
 * Where the squadmates a changed specialist replaces stand: beside it in its group, or
 * beside an enclosing group whose selections lower their limits, as a Skitarii Rangers'
 * options group stands beside the galvanic-rifle Rangers.
 */
function replacedSquadmatesPath(before: Selection, after: Selection, path: readonly string[], index: CatalogueIndex) {
  const holder = index.definitions.get(at(after, path)?.id ?? '')
  if (!holder) return null
  const offered = childrenOf(resolve(holder, index), index)
  const replacing = offered.some(
    (option) =>
      countAt(before, [...path, option.id]) !== countAt(after, [...path, option.id]) &&
      replacesSquadmate(option.definition, offered, index),
  )
  if (replacing) return path
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const group = index.definitions.get(path[depth]!)
    const parent = index.definitions.get(at(after, path.slice(0, depth))?.id ?? '')
    if (!group || !parent || resolve(group, index).type !== undefined) return null
    if (replacesSquadmate(group, childrenOf(resolve(parent, index), index), index)) return path.slice(0, depth)
  }
  return null
}

/**
 * The squadmates a body can be taken from or handed back to: models in the same group
 * with copies available above its minimum. Spend the group's named default first,
 * then the largest remainder, so a specialist replaces an ordinary trooper rather
 * than another specialist and required models remain.
 */
function squadmates(group: Selection, carrierId: string, index: CatalogueIndex): Selection[] {
  const groupDefinition = index.definitions.get(group.id)
  const defaultId = groupDefinition && 'defaultSelectionEntryId' in groupDefinition ? groupDefinition.defaultSelectionEntryId : undefined
  return (group.selections ?? [])
    .filter((child) => {
      if (child.id === carrierId) return false
      const definition = index.definitions.get(child.id)
      return Boolean(definition) && resolve(definition!, index).type === 'model'
    })
    .toSorted((one, other) => {
      const preferred = Number(other.id === defaultId) - Number(one.id === defaultId)
      return preferred || (other.count ?? 1) - (one.count ?? 1)
    })
}

/** Bodies handed back to the squad, the inverse of one being spent to arm a carrier. */
function refundBodies(
  selection: Selection,
  groupPath: readonly string[],
  carrierId: string,
  spare: number,
  index: CatalogueIndex,
  most = (taker: Selection) => maximumCount(index.definitions.get(taker.id)!, index),
): Selection {
  let left = spare
  return updateSelection(selection, groupPath, (group) => {
    const given = new Map<string, number>()
    for (const taker of squadmates(group, carrierId, index)) {
      if (left <= 0) break
      const cap = most(taker)
      const give = Math.min(left, cap === null ? left : Math.max(0, cap - (taker.count ?? 1)))
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
  minimum = (giver: Selection) => requiredCount(index.definitions.get(giver.id)!, index),
): Selection {
  let left = wanted
  return updateSelection(selection, groupPath, (group) => {
    const spent = new Map<string, number>()
    for (const giver of squadmates(group, carrierId, index)) {
      if (left <= 0) break
      const available = Math.max(0, (giver.count ?? 1) - minimum(giver))
      const take = Math.min(left, available)
      if (!take) continue
      spent.set(giver.id, take)
      left -= take
    }
    return {
      ...group,
      selections: (group.selections ?? []).flatMap((child) => {
        const take = spent.get(child.id) ?? 0
        if (!take) return [child]
        const remaining = (child.count ?? 1) - take
        return remaining > 0 ? [withFewerModels(child, remaining, index)] : []
      }),
    }
  })
}

/**
 * Copies of a model given up, with the shared weapon groups they hold given up alongside them.
 *
 * A group holding a collective weapon stores what every copy carries, so three Scions
 * left of four hold three hot-shot lasguns. The group sheds its default first, so a
 * special weapon chosen for one of the remaining Scions stays.
 */
function withFewerModels(model: Selection, count: number, index: CatalogueIndex): Selection {
  return {
    ...model,
    count,
    selections: model.selections?.map((child) => {
      const definition = index.definitions.get(child.id)
      return definition && isCollectiveGroup(definition, index) ? withinGroupCapacity(child, definition, count, index) : child
    }),
  }
}

function withinGroupCapacity(group: Selection, definition: Definition, carriers: number, index: CatalogueIndex): Selection {
  const most = maximumCount(definition, index)
  const held = group.selections ?? []
  let excess = most === null ? 0 : held.reduce((total, option) => total + (option.count ?? 1), 0) - most * carriers
  if (excess <= 0) return group
  const defaultId = 'defaultSelectionEntryId' in definition ? definition.defaultSelectionEntryId : undefined
  const shed = new Map<Selection, number>()
  for (const option of held.toSorted(
    (one, other) => Number(other.id === defaultId) - Number(one.id === defaultId) || (other.count ?? 1) - (one.count ?? 1),
  )) {
    const removed = Math.min(option.count ?? 1, excess)
    shed.set(option, removed)
    excess -= removed
  }
  return {
    ...group,
    selections: held.flatMap((option) => {
      const count = (option.count ?? 1) - (shed.get(option) ?? 0)
      return count > 0 ? [{ ...option, count }] : []
    }),
  }
}
