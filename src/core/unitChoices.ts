/**
 * The decisions a datasheet leaves to the player, and what is currently taken in each.
 *
 * Read from the datasheet rather than from the built selection, because what a unit
 * *may* take is a property of the data: an enhancement group is optional and therefore
 * absent from a default list, and walking only what was built would never offer it.
 */

import { definitionAndTarget, type CatalogueIndex, type Definition, resolve } from './catalogue'
import { scaleOf } from './collective'
import { RecentlyUsed, remember } from './collections'
import {
  childrenOf,
  closedBy,
  exclusiveSets,
  hasDynamicSelectionLimit,
  hasMutableMinimum,
  isRosterToggle,
  MAX_DEPTH,
  maximumCount,
  maximumCountAt,
  modelOwnerOf,
  modelProfileOf,
  type Option,
  pointsOf,
  repeatedCarrierOn,
  repeatedModelOn,
  replacesSquadmate,
  requiredCount,
  UNBOUNDED,
} from './definitions'
import {
  evaluationErrorsFor,
  type EvaluateOptions,
  hiddenByRules,
  hiddenByRulesAt,
  selectionCountBoundsAt,
  type Selection,
} from './evaluate'
import type { ModelKind } from './modelKinds'
import { allAt, at, countAt, replaceAt, withCounts, withSpread } from './selection'
import { isResizable, modelCountOf, sizeOf } from './unitSize'
import type { VsDataDefinitions } from './vsDataConstruction'
import { pointsAt } from './vsDataPoints'
import { enhancementAdmits, keywordsOf, modelBounds, modelCounts, type VsRoster, type VsRosterUnit } from './vsDataRoster'
import { vsFirstFielding, vsUnitOptions, vsUnitSize, vsWithChoice } from './vsDataUnit'

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
  /** How many selections the group must hold across its carriers, when it must hold some. */
  least?: number
  /** Each model has multiple slots in this group, separate from its other equipment. */
  multiplePerModel?: true
  /**
   * Its options replace only their own wargear, as each of a VS Data unit's options does, so it shares its models with
   * no other choice: a press trades only between its own options.
   */
  ownSlot?: true
  /** Whether each option brings its own required models, so taking one also sets the squad's size, as Jakhals' "8 chainblades" and "17 chainblades" do. */
  bundlesModels?: true
  /** For such a choice, the option to hold at each size: the one closest to the weapons held now. */
  bundleBySize?: Record<number, string>
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
  options: {
    id: string
    name: string
    points: number
    count: number
    min: number
    max: number
    /** The option its group names as the ordinary allocation to replace first. */
    default?: boolean
    /** A sibling selection can lower this minimum as part of the same edit. */
    mutableMin?: boolean
    /** Taking any of this option closes every other one, so the squad takes it all together or not at all. */
    wholeSquad?: true
    profile?: string | null
  }[]
  /**
   * The specific model this choice belongs to, when it is not every model in the unit.
   *
   * `profile` is the unit profile the model shares with its siblings, which is what
   * separates the kinds of model a datasheet names — a sergeant from the veterans he
   * leads — from the per-loadout entries the catalogue splits each kind into.
   */
  owner: { id: string; name: string; profile: string | null } | null
}

/** `required` marks a Warlord the data insists on: a unit that must be the army's Warlord whenever it is taken. */
export type UnitToggle = { key: string; name: string; selected: boolean; required?: true }

export const hasWarlordToggle = (toggles: readonly Pick<UnitToggle, 'name' | 'selected'>[]) =>
  toggles.some((toggle) => toggle.name === 'Warlord' && toggle.selected)

export type ChoiceOptions = EvaluateOptions & { depth?: number }

const MODEL_COUNT = /^\d+\s+models?$/i
const CACHE_LIMIT = 4096
/** Longer keys carry a whole roster, as a datasheet view's do; they rarely repeat and would hold megabytes, so they are not kept. */
const CACHE_KEY_LIMIT = 2048

/**
 * A group that picks how many models the squad fields rather than what they carry.
 * Nearly every datasheet titles it "Unit composition"; Wolf Scouts names it after the
 * unit and says so only in its options, which are model counts and nothing else.
 */
export const isUnitCompositionChoice = ({ name, options }: { name: string; options: readonly { name?: string }[] }) =>
  name.trim().toLowerCase() === 'unit composition' ||
  (options.length > 0 && options.every((option) => MODEL_COUNT.test(option.name?.trim() ?? '')))

export function unitChoices(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions = {}): UnitChoice[] {
  return memoized(memoFor(index).choices, memoKey(entryId, selection, options), () =>
    collectUnitChoices(entryId, selection, index, options),
  )
}

/**
 * A unit is rebuilt through many equal selections, in one list and across lists sharing a detachment, so choices and
 * toggles are kept by what they are read from. Callers share the arrays and never mutate them.
 */
type ChoiceMemo = { choices: RecentlyUsed<string, UnitChoice[]>; toggles: RecentlyUsed<string, UnitToggle[]> }
const memos = new WeakMap<CatalogueIndex, ChoiceMemo>()
const memoFor = (index: CatalogueIndex) =>
  remember(memos, index, (): ChoiceMemo => ({ choices: new RecentlyUsed(CACHE_LIMIT), toggles: new RecentlyUsed(CACHE_LIMIT) }))
const memoKey = (entryId: string, selection: Selection, options: ChoiceOptions) =>
  JSON.stringify([entryId, selection, options.primaryCatalogueId, options.roster, options.mustering, options.depth])
const memoized = <T>(store: RecentlyUsed<string, T>, key: string, compute: () => T) =>
  key.length > CACHE_KEY_LIMIT ? compute() : remember(store, key, compute)

const exclusiveSetsByEntry = new WeakMap<CatalogueIndex, WeakMap<Definition, Map<number, string[][]>>>()

function exclusiveSetsIn(entry: Definition, depth: number, index: CatalogueIndex): string[][] {
  return remember(
    remember(
      remember(exclusiveSetsByEntry, index, () => new WeakMap()),
      entry,
      () => new Map(),
    ),
    depth,
    () => {
      const forbidden: string[][] = []
      const gather = (definition: Definition, left: number, seen: Set<string>) => {
        const target = resolve(definition, index)
        if (left <= 0 || seen.has(target.id)) return
        const visited = new Set(seen).add(target.id)
        forbidden.push(...definitionAndTarget(definition, index).flatMap(exclusiveSets))
        for (const child of childrenOf(definition, index)) gather(child.definition, left - 1, visited)
      }
      gather(entry, depth, new Set())
      return forbidden
    },
  )
}

/**
 * Offered as a fresh candidate, or once the unit's choices open it, as a Character
 * upgrade opens a Trygon's enhancements and a Baneblade's Warlord. The built unit alone
 * cannot close an option: what hides it there, such as a squadmate's default bolt
 * rifle, is the player's to change.
 */
function offered(
  entryId: string,
  definition: Definition,
  selection: Selection,
  path: readonly string[],
  lineage: readonly Definition[],
  index: CatalogueIndex,
  options: ChoiceOptions,
  roster = [...(options.roster ?? []), selection],
) {
  const answers = remember(
    remember(
      remember(offeredAnswers, index, () => new WeakMap()),
      selection,
      () => new WeakMap(),
    ),
    options.roster ?? NO_ROSTER,
    () => new Map(),
  )
  return remember(answers, `${entryId}\0${options.primaryCatalogueId}\0${options.mustering}\0${path.join('/')}`, () => {
    return (
      !hiddenByRules(definition, index, { ...options, roster }, lineage) || !hiddenByRulesAt(definition, selection, path, index, options)
    )
  })
}

/**
 * Kept by selection and roster identity, since building a unit reads one selection's choices and toggles more than once.
 * A path names its definition and lineage from the entry, and selections and rosters are never mutated.
 */
const offeredAnswers = new WeakMap<CatalogueIndex, WeakMap<Selection, WeakMap<readonly Selection[], Map<string, boolean>>>>()
const NO_ROSTER: readonly Selection[] = []

function collectUnitChoices(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions): UnitChoice[] {
  const depth = options.depth ?? MAX_DEPTH
  // The unit's own selection has to be in the roster it is judged against, or a
  // question about its surroundings has nothing to look at.
  const roster = [...(options.roster ?? []), selection]
  const entry = index.definitions.get(entryId)
  if (!entry) return []
  const minima = new Map<Definition, number>()
  const visible = (definition: Definition, lineage: readonly Definition[], path: readonly string[]) =>
    offered(entryId, definition, selection, path, lineage, index, options, roster)
  const minimum = (definition: Definition) =>
    remember(minima, definition, () =>
      requiredCount(definition, index, {
        primaryCatalogueId: options.primaryCatalogueId,
        mustering: options.mustering,
        roster,
      }),
    )
  const unitSize = sizeOf(selection, index)
  const resizingPath = unitSize.path
  const resizingGroup = resizingPath.slice(0, -1)

  // One deeper than the choices themselves: the catalogue writes the rule onto each
  // of the options it holds apart, which is a level below the group that offers them.
  const forbidden = exclusiveSetsIn(entry, depth + 1, index)

  const choices: UnitChoice[] = []
  const walk = (
    definition: Definition,
    trail: string[],
    left: number,
    seen: Set<string>,
    carriers: number,
    lineage: readonly Definition[],
  ) => {
    const target = resolve(definition, index)
    if (left <= 0 || seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)
    const enclosing = [...lineage, definition]

    for (const child of childrenOf(definition, index)) {
      const here = [...trail, child.id]
      if (!visible(child.definition, enclosing, here)) continue
      const inner = resolve(child.definition, index)

      const repeatingEntry = inner.type === 'upgrade' ? repeatedModelOn(trail, index) : null
      const lower = minimum(child.definition)
      const upperBound =
        inner.type === 'upgrade'
          ? (selectionCountBoundsAt(selection, here, index, options)?.maximum ?? maximumCount(child.definition, index))
          : null
      const single = inner.type === 'upgrade' && lower === 0 && upperBound === 1
      // An optional upgrade a unit may take more than once, such as two Incubi Shrine Tokens.
      const boundedUpgrade = single || (inner.type === 'upgrade' && upperBound !== null && upperBound > Math.max(lower, 1))
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
          options: [{ id: child.id, name: inner.name ?? child.id, points: pointsOf(child, index), count, min: 0, max: room }],
          uniform: false,
          carried: true,
          owner: modelOwnerOf(trail, index),
        })
      }

      /** Report ungrouped unit upgrades once; grouped options are already represented by their group. */
      if (
        boundedUpgrade &&
        upperBound !== null &&
        !onRepeatedModel &&
        target.type !== undefined &&
        !isRosterToggle(inner.name ?? child.definition.name)
      ) {
        const count = countAt(selection, here)
        choices.push({
          key: here.join('/'),
          name: inner.name ?? child.id,
          chosen: count ? child.id : '',
          optional: lower === 0,
          room: upperBound,
          options: [{ id: child.id, name: inner.name ?? child.id, points: pointsOf(child, index), count, min: lower, max: upperBound }],
          uniform: false,
          carried: false,
          owner: modelOwnerOf(trail, index),
        })
      }

      // A specialist the datasheet holds outside any group, taking a squadmate's place.
      if (
        inner.type === 'model' &&
        target.type !== undefined &&
        lower === 0 &&
        replacesSquadmate(child.definition, childrenOf(definition, index), index)
      ) {
        const count = countAt(selection, here)
        const most = maximumCountAt(selection, here, child.definition, index, options) ?? maximumCount(child.definition, index)
        if (most !== null && most !== UNBOUNDED && Math.max(most, count) > 0) {
          choices.push({
            key: here.join('/'),
            name: inner.name ?? child.id,
            chosen: count ? child.id : '',
            optional: true,
            room: Math.max(most, count),
            options: [
              {
                id: child.id,
                name: inner.name ?? child.id,
                points: pointsOf(child, index),
                count,
                min: 0,
                max: Math.max(most, count),
                profile: modelProfileOf(child.definition, index),
              },
            ],
            uniform: false,
            carried: false,
            owner: modelOwnerOf(trail, index),
          })
        }
      }

      if (inner.type === undefined) {
        const choosable = childrenOf(child.definition, index).filter(
          (option) =>
            visible(option.definition, [...enclosing, child.definition], [...here, option.id]) &&
            resolve(option.definition, index).type !== undefined,
        )
        const repeating = repeatedCarrierOn(here, index)
        const scale = repeating
          ? effectiveCount(selection, repeating.path, repeating.definition, index, options)
          : scaleOf(child.definition, definition, index, carriers)
        const capacity = maximumCountAt(selection, here, child.definition, index, options)
        const owner = modelOwnerOf(trail, index)
        const multiplePerModel =
          owner &&
          capacity !== null &&
          capacity > 1 &&
          capacity !== UNBOUNDED &&
          choosable.every((option) => resolve(option.definition, index).type === 'upgrade')
        const fixed = choosable.some((option) => minimum(option.definition) > 0)
        // Wargear in a group with no cap, hanging off an entry or only uncapped groups, shares
        // no room: a Ratlings squad may take its Battlemutt and its demolition gear together,
        // and a Castigator its storm bolter and hunter-killer missile. Models still compete
        // for the squad's bodies, and an enclosing group's cap still counts what its nested
        // groups hold. Specialists that each take a squadmate's place, as a Skitarii Rangers'
        // options do, compete for no shared room either.
        const independent =
          capacity === null &&
          choosable.length > 1 &&
          ((!fixed &&
            uncappedFromEntry(selection, trail, enclosing, index, options) &&
            choosable.every((option) => resolve(option.definition, index).type === 'upgrade')) ||
            choosable.every((option) => /^This model can be equipped with 1 .+\.$/i.test(resolve(option.definition, index).name ?? '')) ||
            replacesSquadmate(child.definition, childrenOf(definition, index), index))
        const roomFor = (option: Option) => scaled(maximumCount(option.definition, index), scale)
        // An option's own cap as the unit stands, since a squad size can open or close it.
        // The group keeps its full room, so the datasheet still names what a closed option is.
        const capFor = (option: Option) =>
          scaled(
            selectionCountBoundsAt(selection, [...here, option.id], index, options)?.maximum ?? maximumCount(option.definition, index),
            scale,
          )
        const room = capacity === null ? (independent ? sum(choosable.map(roomFor)) : occupantRoom(choosable, index)) : capacity * scale
        const dynamic = choosable.some((option) => minimum(option.definition) === 0 && hasDynamicSelectionLimit(option.definition, index))
        const mutableMinimum = (option: Option) => dynamic && hasMutableMinimum(option.definition, index)
        const variableMinimum = (option: Option) => {
          if (resolve(option.definition, index).type !== 'upgrade') return false
          const minCount = minimum(option.definition)
          const maxCount = maximumCount(option.definition, index, {
            primaryCatalogueId: options.primaryCatalogueId,
            mustering: options.mustering,
            roster,
          })
          return minCount > 0 && maxCount !== null && maxCount > minCount
        }
        const adjustable = fixed
          ? choosable.filter((option) => minimum(option.definition) === 0 || mutableMinimum(option) || variableMinimum(option))
          : choosable
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
        // Replacing one model kind with another must keep the selected squad size.
        // A group's catalogue cap names its largest squad, which is not the room a
        // five-model squad currently has to divide between its loadouts.
        const resizesUnit = resizingGroup.length === here.length && resizingGroup.every((step, position) => step === here[position])
        // A specialist joining the group the unit is sized by replaces one of the
        // models that size counts, so their bodies above their own minimum are room too.
        // A unit of fixed size makes room the same way when taking a specialist lowers a
        // required model's minimum, as a Pathfinder Team's grenade launcher does.
        // Models in an uncapped group nested within that one replace its sized model just
        // the same, as Khorne Berzerkers with alternate weapons replace a Berzerker.
        const nestedInSizing =
          capacity === null &&
          resizingGroup.length + 1 === here.length &&
          resizingGroup.every((step, position) => step === here[position]) &&
          choosable.every((option) => resolve(option.definition, index).type === 'model')
        const sizedBody = resizesUnit
          ? choosable.find((option) => option.id === resizingPath.at(-1) && !adjustable.includes(option))
          : nestedInSizing
            ? childrenOf(definition, index).find((option) => option.id === resizingPath.at(-1))
            : undefined
        const sized =
          sizedBody ??
          (!isResizable(unitSize) && capacity !== null && fixed
            ? choosable.find((option) => !adjustable.includes(option) && hasMutableMinimum(option.definition, index))
            : undefined)
        const sizePath = sizedBody || !sized ? resizingPath : [...here, sized.id]
        const spare = !sized
          ? 0
          : hasMutableMinimum(sized.definition, index)
            ? mutableSpare(selection, here, sized, adjustable, countOf, sizePath, index, options)
            : Math.max(0, (resizesUnit ? countOf(sized.id) : countAt(selection, sizePath)) - minimum(sized.definition) * scale)
        const adjustableRoom = separate
          ? sum(adjustable.map(roomFor))
          : resizesUnit || sized
            ? heldRoom(adjustable, countOf) + spare
            : fixed && adjustable.some(variableMinimum)
              ? room - choosable.filter((option) => !adjustable.includes(option)).reduce((total, option) => total + countOf(option.id), 0)
              : fixed
                ? heldRoom(adjustable, countOf)
                : room
        const maximumFor = (option: Option) => {
          if (independent) return capFor(option)
          if (sized && !repeating) {
            return replacingMaximum(selection, here, option, countOf(option.id) + spare, sizePath, index, options)
          }
          if (!repeating) return legalMaximum(selection, here, option, adjustable, adjustableRoom, index, options)
          if (multiplePerModel) return Math.min(capFor(option), adjustableRoom)
          return separate ? roomFor(option) : adjustableRoom
        }
        // A squad the data will not let hold two of these at once answers the group
        // once for all of it, however many models are carrying it.
        const ids = adjustable.map((option) => new Set([option.id, resolve(option.definition, index).id]))
        const uniform =
          adjustable.length > 1 &&
          forbidden.some((set) => ids.every((option) => set.some((named) => option.has(named))) && set.length >= adjustable.length)
        const heldBy = (option: Option) =>
          [option, ...childrenOf(option.definition, index)].flatMap((part) => [part.id, resolve(part.definition, index).id])
        const closes = (option: Option) =>
          !uniform &&
          adjustable.length > 1 &&
          adjustable.every((other) => other === option || closedBy(other.definition, index).some((id) => heldBy(option).includes(id)))
        const optionalSingle = !fixed && adjustable.length === 1 && minimum(child.definition) === 0
        const defaultId = 'defaultSelectionEntryId' in inner ? inner.defaultSelectionEntryId : undefined
        if (
          (adjustable.length > 1 || optionalSingle || ((separate || sized) && adjustable.length > 0)) &&
          adjustableRoom >= 1 &&
          adjustableRoom !== UNBOUNDED
        ) {
          const taken = held.find((present) => (present.count ?? 1) > 0 && adjustable.some((option) => option.id === present.id))
          choices.push({
            key: here.join('/'),
            name: inner.name ?? 'Choice',
            chosen: taken?.id ?? '',
            // The model the unit is sized by fills whatever specialists are not taken.
            optional:
              minimum(child.definition) === 0 || (sized !== undefined && adjustable.every((option) => minimum(option.definition) === 0)),
            room: adjustableRoom,
            ...(minimum(child.definition) > 0 ? { least: minimum(child.definition) * scale } : {}),
            ...(multiplePerModel ? { multiplePerModel: true as const } : {}),
            ...(!isUnitCompositionChoice({
              name: inner.name ?? '',
              options: adjustable.map((option) => ({ name: resolve(option.definition, index).name })),
            }) &&
            adjustable.every(
              (option) =>
                resolve(option.definition, index).type === 'upgrade' &&
                childrenOf(option.definition, index).some(
                  (body) => resolve(body.definition, index).type === 'model' && minimum(body.definition) > 0,
                ),
            )
              ? { bundlesModels: true as const }
              : {}),
            options: adjustable.map((option) => ({
              id: option.id,
              name: resolve(option.definition, index).name ?? option.id,
              points: pointsOf(option, index),
              count: countOf(option.id),
              min: minimum(option.definition) * scale,
              max: maximumFor(option),
              ...(option.id === defaultId ? { default: true } : {}),
              ...(mutableMinimum(option) ? { mutableMin: true } : {}),
              ...(closes(option) ? { wholeSquad: true as const } : {}),
              ...(resolve(option.definition, index).type === 'model' ? { profile: modelProfileOf(option.definition, index) } : {}),
            })),
            uniform,
            carried: Boolean(repeating),
            owner,
          })
        }
      }

      // What is inside an entry is held by however many of it the selection holds, across every
      // selection a spread has divided a model into, as Death Company Marines given different pistols are.
      if (inner.type !== 'upgrade' || allAt(selection, here).some((selected) => (selected.count ?? 1) > 0)) {
        // An upgrade each of several models holds, as the plasma cannon three heavy weapon Terminators carry, is held once by each.
        const held =
          inner.type === 'model'
            ? allAt(selection, here).reduce((total, selected) => total + (selected.count ?? 1), 0) || 1
            : (at(selection, here)?.count ?? 1) * carriers
        walk(child.definition, here, left - 1, visited, inner.type === undefined ? carriers : held, enclosing)
      }
    }
  }

  walk(entry, [], depth, new Set(), 1, [])
  // Keep a lone owner only when its mandatory range distinguishes that model from the squad.
  const distinguishesOwner = choices.some(
    (choice) => choice.owner && choice.options.some((option) => option.min > 0 && option.max > option.min),
  )
  if (new Set(choices.map((choice) => choice.owner?.id ?? '')).size <= 1 && !distinguishesOwner) {
    return choices.map((choice) => ({ ...choice, owner: null }))
  }
  return choices
}

/**
 * Optional single entries with roster meaning rather than loadout meaning.
 *
 * Read through the same visibility the loadout choices are read through. Who may be
 * the Warlord is in the data and can depend on a selected upgrade or faction.
 * Walking past those conditions can offer the choice to ineligible units.
 */
export function unitToggles(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions = {}): UnitToggle[] {
  return memoized(memoFor(index).toggles, memoKey(entryId, selection, options), () =>
    collectUnitToggles(entryId, selection, index, options),
  )
}

function collectUnitToggles(entryId: string, selection: Selection, index: CatalogueIndex, options: ChoiceOptions): UnitToggle[] {
  const root = index.definitions.get(entryId)
  if (!root) return []
  const found: UnitToggle[] = []
  const walk = (definition: Definition, trail: string[], seen: Set<string>, lineage: readonly Definition[]) => {
    const target = resolve(definition, index)
    if (seen.has(target.id)) return
    const visited = new Set(seen).add(target.id)
    const enclosing = [...lineage, definition]
    for (const child of childrenOf(definition, index)) {
      const here = [...trail, child.id]
      if (!offered(entryId, child.definition, selection, here, enclosing, index, options)) continue
      const inner = resolve(child.definition, index)
      if (isRosterToggle(inner.name ?? child.definition.name)) {
        const required = (selectionCountBoundsAt(selection, here, index, options)?.minimum ?? 0) > 0
        found.push({
          key: here.join('/'),
          name: 'Warlord',
          selected: (at(selection, here)?.count ?? 0) > 0,
          ...(required ? { required: true as const } : {}),
        })
      } else if (inner.type !== 'upgrade' || (at(selection, here)?.count ?? 0) > 0) walk(child.definition, here, visited, enclosing)
    }
  }
  walk(root, [], new Set(), [])
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
  context: EvaluateOptions,
): number {
  const targetId = resolve(definition, index).id
  const ceiling = Math.max(1, modelCountOf(selection, index))
  const size = sizeOf(selection, index)
  const existing = allAt(selection, path).reduce((total, model) => total + (model.count ?? 1), 0)
  // Required models, and the models the unit's size counts, are already counted; only
  // optional specialists can join through a weapon choice.
  if (size.path.join('/') === path.join('/')) return existing
  if (requiredCount(definition, index, { ...context, roster: [...(context.roster ?? []), selection] }) > 0) return existing
  for (let count = Math.max(1, existing + 1); count <= ceiling; count++) {
    let candidate = withCounts(selection, [{ path, count }])
    if (size.path.length) {
      const resized = countAt(candidate, size.path) - (count - existing)
      if (resized < 0) return count - 1
      candidate = withCounts(candidate, [{ path: size.path, count: resized }])
    }
    const errors = candidateErrors(targetId, candidate, index, context)
    if (errors.some((error) => error.limit)) return count - 1
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
  context: EvaluateOptions,
): number {
  const targetId = resolve(option.definition, index).id
  // A model a spread has divided between selections is judged whole, since the limits count across the unit.
  const carrier = path.slice(0, -1)
  const parts = allAt(selection, carrier)
  const whole =
    parts.length > 1
      ? replaceAt(selection, carrier.slice(0, -1), carrier.at(-1)!, [
          { ...parts[0]!, count: parts.reduce((total, part) => total + (part.count ?? 1), 0) },
        ])
      : selection
  // The rest of the room goes to the first other option or, where that one lowers this option's limit as a bright lance
  // lowers a starcannon's, to another piece of wargear within its own limit. Another model would change the unit's size,
  // which limits per so many models read.
  const others = siblings.filter((candidate) => candidate.id !== option.id)
  const substitutes = others.slice(1).filter((other) => resolve(other.definition, index).type !== 'model')
  for (let count = room; count >= 1; count--) {
    const legal = [others[0], ...substitutes].some((other) => {
      const counts: Record<string, number> = { [option.id]: count }
      if (other) counts[other.id] = room - count
      const candidate = withSpread(whole, path.join('/'), counts)
      if (candidateErrors(targetId, candidate, index, context).length) return false
      return other === others[0] || !candidateErrors(resolve(other!.definition, index).id, candidate, index, context).length
    })
    if (legal) return count
  }
  return 0
}

/** The most of an option the unit accepts when each one added replaces a model at `sizePath`. */
function replacingMaximum(
  selection: Selection,
  path: readonly string[],
  option: Option,
  ceiling: number,
  sizePath: readonly string[],
  index: CatalogueIndex,
  context: EvaluateOptions,
): number {
  const targetId = resolve(option.definition, index).id
  const optionPath = [...path, option.id]
  const held = countAt(selection, optionPath)
  const sized = countAt(selection, sizePath)
  for (let count = ceiling; count >= 1; count--) {
    const candidate = withCounts(selection, [
      { path: optionPath, count },
      { path: sizePath, count: sized - (count - held) },
    ])
    const errors = candidateErrors(targetId, candidate, index, context)
    if (!errors.length) return count
  }
  return 0
}

/**
 * How many of the sized model a specialist may replace when taking one lowers that
 * model's minimum, as an Intercessor's grenade launcher does: the most that still
 * leaves both kinds within their own limits.
 */
function mutableSpare(
  selection: Selection,
  path: readonly string[],
  sized: Option,
  adjustable: readonly Option[],
  countOf: (id: string) => number,
  sizePath: readonly string[],
  index: CatalogueIndex,
  context: EvaluateOptions,
): number {
  const sizedId = resolve(sized.definition, index).id
  for (let count = countOf(sized.id); count >= 1; count--) {
    const fits = adjustable.some((option) => {
      const candidate = withCounts(selection, [
        { path: [...path, option.id], count: countOf(option.id) + count },
        { path: sizePath, count: countOf(sized.id) - count },
      ])
      const errors = [sizedId, resolve(option.definition, index).id].flatMap((id) => candidateErrors(id, candidate, index, context))
      return !errors.length
    })
    if (fits) return count
  }
  return 0
}

/** Whether every group between the entry and `trail` leaves its contents uncapped; `enclosing[depth]` sits at `trail.slice(0, depth)`. */
function uncappedFromEntry(
  selection: Selection,
  trail: readonly string[],
  enclosing: readonly Definition[],
  index: CatalogueIndex,
  options: EvaluateOptions,
) {
  for (let depth = trail.length; depth > 0 && resolve(enclosing[depth]!, index).type === undefined; depth--)
    if (maximumCountAt(selection, trail.slice(0, depth), enclosing[depth]!, index, options) !== null) return false
  return true
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

function candidateErrors(id: string, candidate: Selection, index: CatalogueIndex, context: EvaluateOptions) {
  return evaluationErrorsFor(id, [...(context.roster ?? []), candidate], index, {
    primaryCatalogueId: context.primaryCatalogueId,
  })
}

/** The choice keys of a VS Data pick besides its options, which are keyed by their own roster-option IDs. */
export const VS_MODELS = 'models'
export const VS_ENHANCEMENT = 'enhancement'
export const VS_UPGRADE = 'upgrade'
export const VS_ALLEGIANCE = 'allegiance'

/** The roster a VS Data unit is offered in: its book and Detachments, and its units for the conditions that name a Warlord. */
export type VsChoiceContext = { roster?: Pick<VsRoster, 'faction' | 'detachments'> & { units?: VsRoster['units'] } }

const rosterOf = (context: VsChoiceContext): VsRoster => ({
  faction: context.roster?.faction ?? '',
  detachments: context.roster?.detachments ?? [],
  units: context.roster?.units ?? [],
})
const wargearName = (definitions: VsDataDefinitions, id: string) => definitions.get('wargear', id)?.name ?? id

/**
 * A unit as the builder first adds it: as its datasheet first fields it, with the allegiance `sworn` names where a
 * catalogue datasheet stands for one (one Soul Grinder datasheet per god) and the wargear that allegiance requires. A
 * required allegiance with one choice is taken; one with several is left for the player to choose, as the app asks,
 * rather than taking the first.
 */
export function vsFirstPick(definitions: VsDataDefinitions, unitId: string, context: VsChoiceContext = {}, sworn?: string): VsRosterUnit {
  const detachments = context.roster?.detachments ?? []
  const offers = definitions.get('unit', unitId)?.data.allegiances ?? []
  const required = offers.find((offer) => offer.required && (!offer.detachment || detachments.includes(offer.detachment)))
  const offer = sworn ? offers.find((candidate) => candidate.choices.includes(sworn)) : required
  const allegiance = sworn && offer ? sworn : required?.choices.length === 1 ? required.choices[0] : undefined
  const first = vsFirstFielding(definitions, unitId)
  if (!allegiance) return first
  const weapon = offer?.requires?.[allegiance]
  const option = weapon && vsUnitOptions(definitions, first).find((candidate) => candidate.choices.some((choice) => choice.id === weapon))
  const held = option ? Object.values(first.options?.[option.id] ?? {}).reduce((total, count) => total + count, 0) : 0
  const armed = option && weapon ? vsWithChoice(definitions, first, option.id, { [weapon]: held || 1 }) : first
  return { ...armed, allegiance }
}

/** Models whose count the player sets within the unit's size, when there are two or more of them to divide it between. */
function freeModels(definitions: VsDataDefinitions, picked: VsRosterUnit) {
  const size = vsUnitSize(definitions, picked)
  const free = definitions
    .modelsOf(picked.unit)
    .map((model) => ({ model, bounds: modelBounds(model.data, size) }))
    .filter(({ bounds }) => bounds.min < bounds.max)
  return free.length > 1 ? free : []
}

/**
 * A VS Data pick's decisions in the shape the builder draws a BSData unit's: the models it divides its size between, one
 * choice per open option with each of its wargear choices, then its Enhancement and allegiance. An option's choice can
 * reach, by trading the option's other choices for it, the most it holds once they are put down, so a full option still
 * swaps; within room, it can reach what the option's caps and groups leave it.
 */
export function vsUnitChoices(definitions: VsDataDefinitions, picked: VsRosterUnit, context: VsChoiceContext = {}): UnitChoice[] {
  const unit = definitions.get('unit', picked.unit)
  if (!unit) return []
  const counts = modelCounts(definitions, picked)
  const free = freeModels(definitions, picked)
  const choices: UnitChoice[] = []
  if (free.length)
    choices.push({
      key: VS_MODELS,
      name: 'Models',
      chosen: '',
      optional: false,
      carried: false,
      room: free.reduce((total, { model }) => total + counts.get(model.id)!, 0),
      uniform: false,
      owner: null,
      options: free.map(({ model, bounds }) => ({
        id: model.id,
        name: model.name,
        points: 0,
        count: counts.get(model.id)!,
        min: bounds.min,
        max: bounds.max,
        profile: model.id,
      })),
    })
  const priceOf = (item: string) => {
    const found = pointsAt(definitions.points, { kind: 'wargear', faction: unit.data.faction, unit: unit.id, item })
    return found.ok ? found.points : 0
  }
  for (const option of vsUnitOptions(definitions, picked)) {
    if (!option.open || (option.bounds.max === 0 && option.taken === 0)) continue
    const full = option.taken >= option.bounds.max
    const swapped = (id: string) => {
      const alone = vsWithChoice(definitions, picked, option.id, { [id]: option.choices.find((choice) => choice.id === id)!.count })
      return vsUnitOptions(definitions, alone)
        .find((candidate) => candidate.id === option.id)
        ?.choices.find((choice) => choice.id === id)?.most
    }
    const definition = definitions.get('roster-option', option.id)!
    const perCarrier = definition.data.per === 'carrier' ? definition.data.choose.max : option.bounds.max
    choices.push({
      key: option.id,
      name: option.name,
      chosen: option.choices.find((choice) => choice.count > 0)?.id ?? '',
      optional: option.bounds.min === 0,
      carried: false,
      room: option.bounds.max,
      ...(option.bounds.min > 0 ? { least: option.bounds.min } : {}),
      ...(option.carrier && perCarrier > 1 ? { multiplePerModel: true as const } : {}),
      ownSlot: true,
      uniform: option.uniform && !option.substitutes.length,
      owner: null,
      options: option.choices.map((choice) => ({
        id: choice.id,
        name: choice.name,
        points: priceOf(choice.id),
        count: choice.count,
        min: 0,
        max: Math.max(choice.count, full ? (swapped(choice.id) ?? choice.most) : choice.most),
        // A uniform option with substitutes takes its main choice whole and its substitutes a few at a time.
        ...(option.uniform && option.substitutes.length && !option.substitutes.includes(choice.id) ? { wholeSquad: true as const } : {}),
      })),
    })
  }
  const roster = rosterOf(context)
  const keywords = keywordsOf(definitions, roster, picked)
  const held = new Set(picked.enhancement ? [picked.enhancement] : [])
  const admitted = definitions
    .all('enhancement')
    .filter(
      (enhancement) =>
        held.has(enhancement.id) ||
        (roster.detachments.includes(enhancement.data.detachment) && enhancementAdmits(definitions, enhancement, picked, keywords)),
    )
  // The builder asks for a unit's Enhancement and its Detachment upgrade separately, as each Detachment prints them, though
  // a unit holds one of either.
  for (const [key, name, upgrade] of [
    [VS_ENHANCEMENT, 'Enhancements', false],
    [VS_UPGRADE, 'Upgrades', true],
  ] as const) {
    const enhancements = admitted.filter((enhancement) => (enhancement.data.type === 'upgrade') === upgrade)
    if (!enhancements.length) continue
    choices.push({
      key,
      name,
      chosen: enhancements.find((enhancement) => held.has(enhancement.id))?.id ?? '',
      optional: true,
      carried: false,
      room: 1,
      uniform: false,
      owner: null,
      options: enhancements.map((enhancement) => {
        const faction = definitions.get('detachment', enhancement.data.detachment)?.data.faction ?? ''
        const found = pointsAt(definitions.points, {
          kind: 'enhancement',
          faction,
          detachment: enhancement.data.detachment,
          enhancement: enhancement.id,
        })
        const count = held.has(enhancement.id) ? 1 : 0
        return { id: enhancement.id, name: enhancement.name, points: found.ok ? found.points : 0, count, min: 0, max: 1 }
      }),
    })
  }
  const offers = (unit.data.allegiances ?? []).filter((offer) => !offer.detachment || roster.detachments.includes(offer.detachment))
  const allegiances = [...new Set([...offers.flatMap((offer) => offer.choices), ...(picked.allegiance ? [picked.allegiance] : [])])]
  if (allegiances.length)
    choices.push({
      key: VS_ALLEGIANCE,
      name: 'Allegiance',
      chosen: picked.allegiance ?? '',
      optional: !offers.some((offer) => offer.required),
      carried: false,
      room: 1,
      uniform: false,
      owner: null,
      options: allegiances.map((id) => ({
        id,
        name: definitions.get('allegiance', id)?.name ?? id,
        points: 0,
        count: id === picked.allegiance ? 1 : 0,
        min: 0,
        max: 1,
      })),
    })
  return choices
}

/**
 * The models the roster's Detachments let hold the Warlord though they otherwise could not, and those it must be one of;
 * a faction whose rosters take no Detachment, as a Titan Legion's, names both itself.
 */
function warlordModels(definitions: VsDataDefinitions, roster: Pick<VsRoster, 'faction' | 'detachments'>) {
  const without = roster.detachments.length ? undefined : definitions.get('faction', roster.faction)?.data.withoutDetachments
  const detachments = roster.detachments.flatMap((id) => definitions.get('detachment', id)?.data ?? [])
  return {
    granted: new Set([...detachments.flatMap((detachment) => detachment.warlords ?? []), ...(without?.warlords ?? [])]),
    required: new Set([...detachments.flatMap((detachment) => detachment.requiredWarlords ?? []), ...(without?.warlords ?? [])]),
  }
}

/**
 * The unit with one option's choices set by a press, `counts` over the `current` it was pressed against. A uniform option
 * with substitutes holds its one main choice on every carrier that takes no substitute: taking a main choice whole keeps
 * the substitutes held, and any other press keeps the main choice filling what the substitutes leave.
 */
export function vsWithSpread(
  definitions: VsDataDefinitions,
  picked: VsRosterUnit,
  optionId: string,
  current: Readonly<Record<string, number>>,
  counts: Readonly<Record<string, number>>,
): VsRosterUnit {
  const next = { ...current, ...counts }
  const option = vsUnitOptions(definitions, picked).find((candidate) => candidate.id === optionId)
  if (!option?.uniform || !option.substitutes.length)
    return withTiedOptions(definitions, vsWithChoice(definitions, picked, optionId, next), optionId)
  const substitute = (id: string) => option.substitutes.includes(id)
  const raised = option.choices.find((choice) => !substitute(choice.id) && (next[choice.id] ?? 0) > (current[choice.id] ?? 0))
  const main = raised ?? option.choices.find((choice) => !substitute(choice.id) && (next[choice.id] ?? 0) > 0)
  const kept = Object.fromEntries(option.substitutes.map((id) => [id, (raised ? current : next)[id] ?? 0]))
  const held = Object.values(kept).reduce((total, n) => total + n, 0)
  const mains = option.choices.flatMap((choice) =>
    substitute(choice.id) ? [] : [[choice.id, choice === main ? option.bounds.max - held : 0]],
  )
  return withTiedOptions(definitions, vsWithChoice(definitions, picked, optionId, { ...Object.fromEntries(mains), ...kept }), optionId)
}

/**
 * The unit with every uniform option tied to `optionId` (its `uniformOptions`, as a sergeant's and the squad's) taking the
 * main choice it took, on every carrier that takes no substitute, or none where it took none.
 */
function withTiedOptions(definitions: VsDataDefinitions, picked: VsRosterUnit, optionId: string): VsRosterUnit {
  const tied = (definitions.get('unit', picked.unit)?.data.uniformOptions ?? []).filter((group) => group.includes(optionId)).flat()
  if (!tied.length) return picked
  const options = vsUnitOptions(definitions, picked)
  const source = options.find((option) => option.id === optionId)!
  const main = source.choices.find((choice) => choice.count > 0 && !source.substitutes.includes(choice.id))?.id
  return options
    .filter((option) => option.id !== optionId && tied.includes(option.id) && option.carriers > 0)
    .reduce((unit, option) => {
      const held = option.choices.filter((choice) => option.substitutes.includes(choice.id))
      const room = option.bounds.max - held.reduce((total, choice) => total + choice.count, 0)
      const counts = Object.fromEntries([
        ...held.map((choice) => [choice.id, choice.count] as const),
        ...(main && option.choices.some((choice) => choice.id === main) ? [[main, room] as const] : []),
      ])
      return vsWithChoice(definitions, unit, option.id, counts)
    }, picked)
}

/** The model a unit names as its Warlord: one the roster grants or requires, else its one leader, else its first model. */
export function vsWarlordModel(
  definitions: VsDataDefinitions,
  unitId: string,
  roster: Pick<VsRoster, 'faction' | 'detachments'>,
): string | undefined {
  const models = definitions.modelsOf(unitId)
  const { granted, required } = warlordModels(definitions, roster)
  const able = models.filter((model) => model.data.warlord !== false)
  const leaders = able.filter((model) => model.data.max === 1)
  return (
    models.find((model) => granted.has(model.id) || required.has(model.id)) ??
    able.find((model) => model.data.keywords?.some((keyword) => keyword.toUpperCase() === 'CHARACTER')) ??
    (leaders.length === 1 ? leaders[0] : able[0])
  )?.id
}

/**
 * A VS Data pick's Warlord, keyed by the model that holds it, offered to a CHARACTER of the roster's own book or a model
 * the roster grants the role.
 */
export function vsUnitToggles(definitions: VsDataDefinitions, picked: VsRosterUnit, context: VsChoiceContext = {}): UnitToggle[] {
  const unit = definitions.get('unit', picked.unit)
  if (!unit) return []
  const roster = rosterOf(context)
  const models = definitions.modelsOf(unit.id).map((model) => model.id)
  // A model VS Data keeps from the role holds it only where the roster grants it.
  const able = definitions.modelsOf(unit.id).some((model) => model.data.warlord !== false)
  const own = [roster.faction, definitions.get('faction', roster.faction)?.data.parent]
  const warlord = picked.warlord ?? vsWarlordModel(definitions, unit.id, roster)
  if (!warlord) return []
  // The Warlord's model holds the unit's keywords and its own, as a Command Squad's Commander is its one CHARACTER.
  const held = [...keywordsOf(definitions, roster, picked), ...(definitions.get('model', warlord)?.data.keywords ?? [])]
  const character = held.some((keyword) => keyword.toUpperCase() === 'CHARACTER')
  const allied = definitions.get('faction', roster.faction)?.data.allies?.some((ally) => ally.units.includes(unit.id))
  const { granted, required } = warlordModels(definitions, roster)
  if (!models.some((id) => granted.has(id)) && (!able || !character || allied || !own.includes(unit.data.faction))) return []
  const must = models.some((id) => required.has(id))
  return [{ key: warlord, name: 'Warlord', selected: picked.warlord !== undefined, ...(must ? { required: true as const } : {}) }]
}

/**
 * A VS Data pick's kinds of model, each with the wargear it carries by default, less what its options replace, and a
 * row for each choice of the options it carries. An option no model carries joins the unit's one kind of model, or is
 * the unit's to answer below its models where it has several.
 */
export function vsModelKinds(definitions: VsDataDefinitions, picked: VsRosterUnit): ModelKind[] {
  const unit = definitions.get('unit', picked.unit)
  if (!unit) return []
  const counts = modelCounts(definitions, picked)
  const countable = new Set(freeModels(definitions, picked).map(({ model }) => model.id))
  const models = definitions.modelsOf(unit.id).filter((model) => counts.get(model.id)! > 0 || countable.has(model.id))
  const lone = models.length === 1 ? models[0]!.id : undefined
  const open = vsUnitOptions(definitions, picked).filter((option) => option.open && (option.bounds.max > 0 || option.taken > 0))
  // A unit with nothing to choose shows its wargear as one summary, as the pane shows a catalogue unit's.
  if (!open.length && !countable.size) return []
  const held = new Map(models.map((model) => [model.id, new Map<string, number>()]))
  const carry = (bag: Map<string, number>, id: string, n: number) => {
    const inside = definitions.get('wargear', id)?.data.includes
    if (inside) for (const [piece, k] of Object.entries(inside)) carry(bag, piece, n * k)
    else bag.set(id, (bag.get(id) ?? 0) + n)
  }
  for (const model of models)
    for (const [id, n] of Object.entries(model.data.wargear)) carry(held.get(model.id)!, id, n * counts.get(model.id)!)
  const unitWargear = models[0] && held.get(models[0].id)
  if (unitWargear) for (const [id, n] of Object.entries(unit.data.wargear ?? {})) carry(unitWargear, id, n)
  for (const option of open) {
    const bag =
      (option.carrier && held.get(option.carrier)) ||
      [...held.values()].find((candidate) => Object.keys(option.replaces).every((id) => (candidate.get(id) ?? 0) > 0))
    if (bag) for (const [id, n] of Object.entries(option.replaces)) carry(bag, id, -n * option.taken)
  }
  return models.map((model) => {
    const count = counts.get(model.id)!
    const each = new Map<string, number>()
    for (const [id, n] of Object.entries(model.data.wargear)) carry(each, id, n)
    return {
      name: model.name,
      fixed: [...held.get(model.id)!].map(([id, n]) => {
        const per = each.get(id)
        const plain = per !== undefined && n === per * count
        return {
          name: wargearName(definitions, id),
          ...(plain ? {} : { count: Math.max(0, n) }),
          ...(plain && per !== 1 ? { each: { [model.id]: per } } : {}),
        }
      }),
      members: [{ id: model.id, choiceKey: countable.has(model.id) ? VS_MODELS : null, baseCount: count }],
      rows: open
        .filter((option) => (option.carrier ?? lone) === model.id)
        .flatMap((option) =>
          option.choices.map((choice) => {
            const inside = Object.keys(definitions.get('wargear', choice.id)?.data.includes ?? {})
            return {
              choiceKey: option.id,
              optionId: choice.id,
              name: choice.name,
              ...(inside.length ? { pieces: inside.map((id) => wargearName(definitions, id)) } : {}),
            }
          }),
        ),
    }
  })
}
