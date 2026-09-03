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
import { childrenOf, MAX_DEPTH, maximumCount, repeatedCarrierOn, repeatedModelOn, requiredCount, resolve, UNBOUNDED } from './definitions'
import { type EvaluateOptions, selectionCountBoundsAt, type Selection } from './evaluate'
import { expand, withChoice } from './expand'
import { allAt, at, replaceAt, updateSelection, withCounts, withoutSelectionAt, withPlaceFor, withSpread } from './selection'
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
    return keepingTheSquad(selection, withModelOccupants(selection, path, counts, group, occupants, index, options), path, index)
  }

  const repeatedEntry = repeatedModelOn(path.slice(0, -1), index)
  const entry = group ? resolve(group, index) : undefined
  if (repeatedEntry && entry?.type === 'upgrade' && groupId) {
    return spreadRepeatedUpgrade(selection, path, counts[groupId] ?? 0, repeatedEntry)
  }
  if (entry?.type === 'upgrade' && groupId) {
    return withCounts(selection, [{ path, count: counts[groupId] ?? 0 }])
  }

  const repeating = repeatedCarrierOn(path, index)
  if (!repeating)
    return group
      ? keepingTheSquad(selection, spreadOptions(selection, path, counts, group, index), path, index)
      : withSpread(selection, key, counts)

  if (group && maximumCount(group, index) === null) {
    return spreadIndependentRepeatedGroup(selection, path, counts, repeating, group, index)
  }
  return spreadRepeatedGroup(selection, path, counts, repeating, index)
}

export function withUnitChoice(
  selection: Selection,
  key: string,
  optionId: string,
  index: CatalogueIndex,
  options: EvaluateOptions = {},
): Selection {
  const path = key.split('/')
  const carrier = withExpandedCarrier(selection, path, index)
  if (!selectedCarriers(carrier, path, index)) return selection
  const chosen = withChoice(carrier, key, optionId, index, options)
  return keepingTheSquad(selection, chosen, path, index)
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
  return updateSelection(withPlaceFor(carrier, path), path, (held) => ({
    ...held,
    selections: [
      ...(held.selections ?? []).filter((child) => !requested.has(child.id)),
      ...Object.entries(counts).flatMap(([optionId, count]) => {
        const option = byId.get(optionId)
        return option && count > 0 ? [expand(option.id, option.definition, index, MAX_DEPTH, count, new Set(), 1)] : []
      }),
    ],
  }))
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
  const capacity = selectionCountBoundsAt(selection, path, index, options)?.maximum ?? maximumCount(group, index)
  const asking = Object.values(counts).some((count) => count > 0)
  const carrier = asking ? withExpandedCarrier(selection, path, index) : selection
  if (!selectedCarriers(carrier, path, index)) return selection
  return updateSelection(asking ? withPlaceFor(carrier, path) : carrier, path, (held) => {
    // A saved list can ask for more bodies than the squad has, either because the
    // catalogue's limits moved under it or because two of its own requests
    // disagree. The group's own maximum is the answer, and the models it says
    // nothing about are counted first because they are already standing there.
    const untouched = (held.selections ?? []).filter((child) => !optionIds.has(child.id))
    let left =
      capacity === null || capacity === UNBOUNDED
        ? Number.POSITIVE_INFINITY
        : Math.max(0, capacity - untouched.reduce((total, child) => total + (child.count ?? 1), 0))
    const defaultId = 'defaultSelectionEntryId' in group ? group.defaultSelectionEntryId : undefined
    const allocated = new Map<string, number>()
    for (const option of occupants
      .filter((candidate) => Object.hasOwn(counts, candidate.id))
      .toSorted((one, other) => Number(one.id === defaultId) - Number(other.id === defaultId))) {
      const count = Math.min(counts[option.id] ?? 0, left)
      allocated.set(option.id, count)
      left -= count
    }
    return {
      ...held,
      selections: [
        ...untouched,
        ...occupants.flatMap((option) => {
          const count = allocated.get(option.id) ?? 0
          return count > 0 ? [expand(option.id, option.definition, index, MAX_DEPTH, count, new Set(), 1)] : []
        }),
      ],
    }
  })
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
  // The carrier can be as absent as the group it holds — a squad arming its first
  // flamer has neither the flamer nor the biker to hang it on — so the group the
  // carrier stands in needs its place made before the carrier can be put there.
  const replaced = replaceAt(requested.length ? withPlaceFor(selection, holder) : selection, holder, modelId, variants)
  // Arming a model this squad did not have yet puts a body in it, and the squad is
  // already as big as it is allowed to be. The body comes from one of its own — a
  // veteran puts down his bolt rifle to carry the heavy bolter — and never from a
  // model the data insists on, which is how the sergeant used to be squeezed out.
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
) {
  const modelId = repeating.path.at(-1)
  if (!modelId) return selection
  const withinModel = path.slice(repeating.path.length)
  const options = childrenOf(resolve(group, index), index).filter((option) => requiredCount(option.definition, index) === 0)
  const optionIds = new Set(options.map((option) => option.id))
  let variants = allAt(selection, repeating.path).map((model) =>
    updateSelection(withPlaceFor(model, withinModel), withinModel, (held) => ({
      ...held,
      selections: held.selections?.filter((child) => !optionIds.has(child.id)),
    })),
  )
  const carriers = variants.reduce((total, model) => total + (model.count ?? 1), 0)

  for (const option of options) {
    const capacity = Math.max(1, maximumCount(option.definition, index) ?? 1)
    let remaining = Math.min(Math.max(0, counts[option.id] ?? 0), carriers * capacity)
    const equipped: Selection[] = []
    for (const model of variants) {
      const modelCount = model.count ?? 1
      const full = Math.min(modelCount, Math.floor(remaining / capacity))
      if (full > 0) equipped.push(withIndependentOption({ ...model, count: full }, withinModel, option, capacity, index))
      remaining -= full * capacity

      const partial = remaining > 0 && full < modelCount ? remaining : 0
      if (partial > 0) equipped.push(withIndependentOption({ ...model, count: 1 }, withinModel, option, partial, index))
      if (partial > 0) remaining = 0

      const untouched = modelCount - full - Number(partial > 0)
      if (untouched > 0) equipped.push({ ...model, count: untouched })
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

/**
 * The squad the size it was, after a request armed something inside it.
 *
 * How many models a squad fields is the size the player set, and asking for a weapon
 * is not asking for that to change: a magna-rail rifle is one of the ten warriors
 * carrying it, and a Chaos Biker's flamer is taken *instead of* his combi-bolter. So
 * a model brought into the squad's own group costs a squadmate their place, and one
 * put down hands the place back.
 *
 * Only inside that group. A drone, a plasmacyte or a pack of hunting wolves is filed
 * outside the group whose bounds are the squad's size, because it is an addition to
 * the squad rather than one of its models, and taking one has to make the unit bigger.
 */
function keepingTheSquad(before: Selection, after: Selection, path: readonly string[], index: CatalogueIndex): Selection {
  const squad = sizeOf(before, index).path.slice(0, -1)
  const inside = squad.length > 0 && path.length > squad.length && squad.every((step, depth) => path[depth] === step)
  if (!inside) return after
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
): Selection {
  let left = spare
  return updateSelection(selection, groupPath, (group) => {
    const given = new Map<string, number>()
    for (const taker of squadmates(group, carrierId, index)) {
      if (left <= 0) break
      const cap = maximumCount(index.definitions.get(taker.id)!, index)
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
): Selection {
  let left = wanted
  return updateSelection(selection, groupPath, (group) => {
    const spent = new Map<string, number>()
    for (const giver of squadmates(group, carrierId, index)) {
      if (left <= 0) break
      const definition = index.definitions.get(giver.id)!
      const available = Math.max(0, (giver.count ?? 1) - requiredCount(definition, index))
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
        return remaining > 0 ? [{ ...child, count: remaining }] : []
      }),
    }
  })
}
