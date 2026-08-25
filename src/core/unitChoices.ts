/**
 * The decisions a datasheet leaves to the player, and what is currently taken in each.
 *
 * Read from the datasheet rather than from the built selection, because what a unit
 * *may* take is a property of the data: an enhancement group is optional and therefore
 * absent from a default list, and walking only what was built would never offer it.
 */

import type { CatalogueIndex, Definition } from './catalogue'
import {
  childrenOf,
  exclusiveSets,
  isRosterToggle,
  MAX_DEPTH,
  maximumCount,
  modelOwnerOf,
  modelProfileOf,
  type Option,
  pointsOf,
  repeatedCarrierOn,
  repeatedModelOn,
  requiredCount,
  resolve,
  scaleOf,
  UNBOUNDED,
} from './definitions'
import { evaluate, hiddenByRules, type Selection } from './evaluate'
import { allAt, at, countAt, withCounts, withSpread } from './selection'
import { modelCountOf, sizeOf } from './unitSize'

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
   * Whether the squad has to answer this one way for all of it.
   *
   * "All models in this unit can each have their gauss blaster replaced with 1 tesla
   * carbine" is one decision taken once, not five taken separately, and the data says
   * so by calling a squad holding both an error. A group with room for several is
   * otherwise a squad dividing itself, so without this the pane offers a count against
   * each option and only objects once the player has used it.
   */
  uniform: boolean
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

export type UnitToggle = { key: string; name: string; selected: boolean }

export type ChoiceOptions = { primaryCatalogueId?: string; depth?: number; roster?: readonly Selection[] }

export const isUnitCompositionChoice = ({ name }: Pick<UnitChoice, 'name'>) => name.trim().toLocaleLowerCase() === 'unit composition'

export function unitChoices(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions = {}): UnitChoice[] {
  const depth = options.depth ?? MAX_DEPTH
  // The unit's own selection has to be in the roster it is judged against, or a
  // question about its surroundings has nothing to look at.
  const roster = [...(options.roster ?? []), selection]
  const visible = (definition: Definition) => !hiddenByRules(definition, index, { ...options, roster })
  const minimum = (definition: Definition) => requiredCount(definition, index, { primaryCatalogueId: options.primaryCatalogueId, roster })
  const entry = index.definitions.get(entryId)
  if (!entry) return []

  /**
   * What the datasheet refuses to see held together, wherever it says so.
   *
   * A squad that must match is written against the unit for Immortals and against the
   * weapon group itself for Lychguard, so the answer is the same either way only if
   * the whole datasheet is read for it.
   */
  const forbidden: string[][] = []
  const gather = (definition: Definition, left: number, seen: Set<string>) => {
    const target = resolve(definition, index)
    if (left <= 0 || seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)
    forbidden.push(...exclusiveSets(definition), ...(target === definition ? [] : exclusiveSets(target)))
    for (const child of childrenOf(target, index)) gather(child.definition, left - 1, visited)
  }
  // One deeper than the choices themselves: the catalogue writes the rule onto each
  // of the options it holds apart, which is a level below the group that offers them.
  gather(entry, depth + 1, new Set())

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
      const single = inner.type === 'upgrade' && minimum(child.definition) === 0 && maximumCount(child.definition, index) === 1
      const onRepeatedModel = Boolean(repeatingEntry && repeatingEntry.path.length === trail.length)
      if (repeatingEntry && onRepeatedModel && single) {
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
          uniform: false,
          carried: true,
          owner: modelOwnerOf(trail, index),
        })
      }

      /**
       * An upgrade the data hangs on the unit itself rather than inside a group.
       *
       * A group is the usual way to write "one of these", so everything that reads
       * choices looks for one — but a lone yes-or-no needs no group to hold it and
       * is written without one, leaving nothing for the group branch to notice.
       * That is a Chaos unit's icon, an Infiltrator Squad's comms array, the
       * demolition charge on Imperial Navy Breachers, and the Tank Ace Character
       * upgrade a Land Raider needs before it can lead an army.
       *
       * Only where the carrier is a real entry: inside a group the occupants are
       * already reported together, and reporting them again would draw one control
       * for the group and a second for every option in it.
       */
      if (single && !onRepeatedModel && target.type !== undefined && !isRosterToggle(inner.name ?? child.definition.name)) {
        const count = countAt(selection, here)
        choices.push({
          key: here.join('/'),
          name: inner.name ?? child.id,
          chosen: count ? child.id : '',
          optional: true,
          room: 1,
          options: [{ id: child.id, name: inner.name ?? child.id, points: pointsOf(child, index), count, max: 1 }],
          uniform: false,
          carried: false,
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
        const fixed = choosable.some((option) => minimum(option.definition) > 0)
        const adjustable = fixed ? choosable.filter((option) => minimum(option.definition) === 0) : choosable
        const held = repeating
          ? repeatedOptions(selection, repeating.path, here.slice(repeating.path.length))
          : allAt(selection, here).flatMap((group) => group.selections ?? [])
        // One model kind can sit in the group more than once — two veterans with a
        // pyrecannon and two more with a heavy bolter are four selections of the
        // same entry — so how many there are is a sum, not the first one found.
        const countOf = (id: string) =>
          held.filter((present) => present.id === id).reduce((total, present) => total + (present.count ?? 1), 0)
        // A group with a cap of its own shares it out, so what is left for the optional
        // occupants is what a required sibling is not already holding. A group with no
        // cap makes nothing compete: a hunter-killer missile, a multi-melta and a storm
        // bolter each answer only to their own maximum, once for every model carrying
        // the group, and a tank may carry all three.
        const separate = fixed && capacity === null
        const roomFor = (option: Option) => scaled(maximumCount(option.definition, index), scale)
        const adjustableRoom = separate ? sum(adjustable.map(roomFor)) : fixed ? heldRoom(adjustable, countOf) : room
        const maximumFor = (option: Option) => {
          if (!repeating) return legalMaximum(selection, here, option, adjustable, adjustableRoom, index, options)
          return separate ? roomFor(option) : adjustableRoom
        }
        // A squad the data will not let hold two of these at once answers the group
        // once for all of it, however many models are carrying it.
        const ids = adjustable.map((option) => new Set([option.id, resolve(option.definition, index).id]))
        const uniform =
          adjustable.length > 1 &&
          forbidden.some((set) => ids.every((option) => set.some((named) => option.has(named))) && set.length >= adjustable.length)
        const optionalSingle = !fixed && adjustable.length === 1 && minimum(child.definition) === 0
        if (
          (adjustable.length > 1 || optionalSingle || (separate && adjustable.length > 0)) &&
          adjustableRoom >= 1 &&
          adjustableRoom !== UNBOUNDED
        ) {
          const taken = held.find((present) => (present.count ?? 1) > 0 && adjustable.some((option) => option.id === present.id))
          choices.push({
            key: here.join('/'),
            name: inner.name ?? 'Choice',
            chosen: taken?.id ?? '',
            optional: minimum(child.definition) === 0,
            room: adjustableRoom,
            options: adjustable.map((option) => ({
              id: option.id,
              name: resolve(option.definition, index).name ?? option.id,
              points: pointsOf(option, index),
              count: countOf(option.id),
              max: maximumFor(option),
              ...(resolve(option.definition, index).type === 'model' ? { profile: modelProfileOf(option.definition, index) } : {}),
            })),
            uniform,
            carried: Boolean(repeating),
            owner: modelOwnerOf(trail, index),
          })
        }
      }

      // What is inside an entry is held by however many of it the selection holds.
      if (inner.type !== 'upgrade' || allAt(selection, here).some((selected) => (selected.count ?? 1) > 0)) {
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
 * Optional single entries with roster meaning rather than loadout meaning.
 *
 * Read through the same visibility the loadout choices are read through. Who may be
 * the Warlord is in the data and it is conditional: a Land Raider carries the entry
 * only underneath the Tank Ace Character upgrade a couple of detachments unlock, and
 * a daemon borrowed into a Chaos Space Marine book carries one its own book hides.
 * Walking past those conditions offered a crown to every tank in the game.
 */
export function unitToggles(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions = {}): UnitToggle[] {
  const root = index.definitions.get(entryId)
  if (!root) return []
  const roster = [...(options.roster ?? []), selection]
  const visible = (definition: Definition) => !hiddenByRules(definition, index, { ...options, roster })
  const found: UnitToggle[] = []
  const walk = (definition: Definition, trail: string[], seen: Set<string>) => {
    const target = resolve(definition, index)
    if (seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)
    for (const child of childrenOf(target, index)) {
      if (!visible(child.definition)) continue
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

/** How many of a repeated carrier the list will actually accept, found by asking. */
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

/** What the optional occupants of a capped group have left once the required ones are placed. */
const heldRoom = (adjustable: Option[], countOf: (id: string) => number) =>
  adjustable.reduce((total, option) => total + countOf(option.id), 0)

/** One occupant's allowance across every model carrying the group. */
const scaled = (cap: number | null, carriers: number) => (cap === null ? UNBOUNDED : cap * carriers)

/** Occupants that share no capacity are bounded one by one, so their room adds up. */
const sum = (rooms: number[]) => (rooms.includes(UNBOUNDED) ? UNBOUNDED : rooms.reduce((total, room) => total + room, 0))
