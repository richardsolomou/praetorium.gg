import { escapeRegExp } from '../../../../core/text'
import { groupBy, uniqueBy } from '../../../../core/collections'
import type { Datasheet } from '../../../../contracts/catalogue'
import { DEFAULT_WARGEAR } from '../../../../shared/datacards'
import {
  modelFixedCount,
  modelRowCount,
  modelRowPieces,
  modelRowSources,
  type ModelKind,
  type ModelRow,
  type ModelRowSource,
} from '../../../../core/modelKinds'
import { sameWargear, wargearBaseName, wargearKey } from '../../../../core/wargear'

/**
 * What the loadout pane is drawing, and the reasoning that does not need a screen.
 *
 * Matching a wargear name to the profiles and rules that describe it, ordering the
 * rows of a card, and working out what a step on one option does to its siblings. All
 * of it pure, so the pane's own file is only the drawing.
 */

export type LoadoutChoice = {
  key: string
  name: string
  chosen: string
  optional: boolean
  carried: boolean
  room: number
  /** The squad answers this once for all of it, however many models carry it. */
  uniform: boolean
  owner: { id: string; name: string; profile: string | null } | null
  kind?: 'enhancement' | 'upgrade'
  options: {
    id: string
    name: string
    pieces?: string[]
    pieceCounts?: { name: string; count: number }[]
    points: number
    count: number
    min: number
    max: number
    default?: boolean
    mutableMin?: boolean
    replacements?: { choiceKey: string; optionId: string }[]
    description?: string | null
    keywordRules?: Datasheet['keywordRules']
  }[]
}

export type LoadoutOption = LoadoutChoice['options'][number]

export type LoadoutModel = ModelKind

export type LoadoutUnit = {
  entryId: string
  name: string
  points: number
  size: { min: number; max: number; models: number; options?: number[]; resizable: boolean }
  toggles: { key: string; name: string; selected: boolean }[]
  choices: LoadoutChoice[]
  models: LoadoutModel[]
}

export type WeaponProfileData = Datasheet['profiles'][number]

export function unmodeledGrantedWeapons(
  profiles: readonly WeaponProfileData[],
  models: readonly LoadoutModel[],
  choices: readonly LoadoutChoice[],
) {
  const modeled = new Set(
    models
      .flatMap((model) => [...model.fixed.map((piece) => piece.name), ...model.rows.flatMap((row) => row.pieces ?? [row.name])])
      .map((name) => wargearKey(name)),
  )
  const granted = new Set(
    choices
      .filter((choice) => choice.kind)
      .flatMap((choice) =>
        choice.options.filter((option) => option.count > 0).flatMap((option) => option.pieceCounts?.map((piece) => piece.name) ?? []),
      )
      .map((name) => wargearKey(name)),
  )
  return profiles.filter(
    (profile) =>
      weaponProfileNames(profile).some((name) => granted.has(wargearKey(name))) &&
      !weaponProfileNames(profile).some((name) => modeled.has(wargearKey(name))),
  )
}

export function loadoutInstructions(
  row: Pick<ModelRow, 'name' | 'pieces'>,
  model: LoadoutModel,
  models: readonly LoadoutModel[],
  groups: NonNullable<Datasheet['wargearGroups']>,
  /** An instruction's words, or null while they are not loaded, when it is read as naming no model. */
  wordsOf: (instruction: string) => string | null = (instruction) => instruction,
) {
  const names = row.pieces ?? [row.name]
  const candidates = groups.flatMap((group) => {
    if (group.instruction === DEFAULT_WARGEAR) return []
    const words = wordsOf(group.instruction) ?? ''
    const namedModels = models.filter((candidate) => new RegExp(`\\b${escapeRegExp(candidate.name)}(?:s\\b|\\b)`, 'i').test(words))
    if (namedModels.length && !namedModels.includes(model)) return []
    const matches = group.options.filter((option) => names.some((name) => sameWargear(wargearBaseName(option), name))).length
    return matches ? [{ instruction: group.instruction, matches }] : []
  })
  const best = Math.max(0, ...candidates.map((candidate) => candidate.matches))
  return [...new Set(candidates.filter((candidate) => candidate.matches === best).map((candidate) => candidate.instruction))]
}

type LoadoutRowSource = { choice: LoadoutChoice; option: LoadoutOption }

/** The choice keyed `key` and its option `id`, when the choices hold both. */
export function findOption<C extends { key: string; options: readonly { id: string }[] }>(
  choices: readonly C[],
  key: string | null | undefined,
  id: string | null | undefined,
): { choice: C; option: C['options'][number] } | null {
  const choice = choices.find((candidate) => candidate.key === key)
  const option = choice?.options.find((candidate) => candidate.id === id)
  return choice && option ? { choice, option } : null
}

export const loadoutRowSources = (row: ModelRow, choices: readonly LoadoutChoice[]): LoadoutRowSource[] =>
  modelRowSources(row).flatMap((source) => findOption(choices, source.choiceKey, source.optionId) ?? [])

const optionCount =
  (choices: readonly LoadoutChoice[]) =>
  ({ choiceKey, optionId }: ModelRowSource) =>
    findOption(choices, choiceKey, optionId)?.option.count ?? 0

export const loadoutRowCount = (row: ModelRow, choices: readonly LoadoutChoice[]) => modelRowCount(row, optionCount(choices))

export const loadoutFixedCount = (model: LoadoutModel, piece: LoadoutModel['fixed'][number], choices: readonly LoadoutChoice[]) =>
  modelFixedCount(model, piece, optionCount(choices))

function loadoutRowBand(row: ModelRow, profiles: readonly WeaponProfileData[]) {
  const matched = weaponProfilesFor(row, profiles)
  if (matched.some((profile) => profile.type === 'Ranged Weapons')) return 'ranged'
  if (matched.some((profile) => profile.type === 'Melee Weapons')) return 'melee'
  return `choice:${row.choiceKey}`
}

export function replacementChoice(
  row: ModelRow,
  model: LoadoutModel,
  choices: readonly LoadoutChoice[],
  models: number,
): LoadoutChoice | null {
  if (loadoutRowCount(row, choices) >= models) return null
  for (const candidate of model.rows) {
    if (candidate === row || !candidate.pieces?.some((piece) => sameWargear(row.name, piece))) continue
    const selected = loadoutRowSources(candidate, choices).find(
      ({ choice, option }) => choice.owner && choice.room === 1 && choice.chosen === option.id,
    )
    if (selected) return selected.choice
  }
  return null
}

export function choiceRemoval(choice: LoadoutChoice, option: LoadoutOption, replacesAnotherRow: boolean): string | null {
  if (option.count <= 0 || choice.chosen !== option.id) return null
  return choice.optional || (choice.owner && replacesAnotherRow) ? '' : null
}

export const canAddPooledOption = (option: LoadoutOption, donor?: LoadoutRowSource) =>
  option.count < option.max ||
  Boolean(
    donor &&
    option.replacements?.some((replacement) => replacement.choiceKey === donor.choice.key && replacement.optionId === donor.option.id),
  )

/** What a change to one option leaves every option in its group holding. */
export type SpreadCounts = Record<string, number>

/** A counter press folded against the counts that the pick holds when it runs. */
export type SpreadUpdate = (counts: SpreadCounts) => SpreadCounts | null

/**
 * The counts a press folds against: what the pick saved for the group over what was built.
 *
 * Saved counts the group no longer has room for describe models a specialist has since
 * replaced, so the build shed them and folding against them would undo the wrong weapon.
 */
export function pressedCounts(
  choice: { room?: number; options: readonly { id: string; count: number }[] },
  saved?: SpreadCounts,
): SpreadCounts {
  const built = Object.fromEntries(choice.options.map((option) => [option.id, option.count]))
  const savedTotal = Object.values(saved ?? {}).reduce((total, count) => total + count, 0)
  return choice.room !== undefined && savedTotal > choice.room ? built : { ...built, ...saved }
}

/** Prefer the catalogue's ordinary allocation before taking a specialist's place. */
export const donorPriority = (left: LoadoutOption, right: LoadoutOption) =>
  Number(Boolean(right.default)) - Number(Boolean(left.default)) || right.count - left.count

export function changedDraftSpreadCounts(
  current: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
  evaluated: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
) {
  const changed = Object.entries(current ?? {}).filter(([key, counts]) => {
    const previous = evaluated?.[key]
    return (
      !previous ||
      Object.keys(counts).length !== Object.keys(previous).length ||
      Object.entries(counts).some(([id, count]) => previous[id] !== count)
    )
  })
  return changed.length ? Object.fromEntries(changed) : undefined
}

export function withDraftSpreadCounts(
  choices: readonly LoadoutChoice[],
  spreads: Readonly<Record<string, Readonly<Record<string, number>>>> | undefined,
): LoadoutChoice[] {
  return choices.map((choice) => {
    const counts = spreads?.[choice.key]
    if (!counts) return choice
    return {
      ...choice,
      options: choice.options.map((option) => (Object.hasOwn(counts, option.id) ? { ...option, count: counts[option.id] ?? 0 } : option)),
    }
  })
}

/** Editing shows every available option; a finished roster shows only what is held. */
export function showLoadoutEntry(count: number, showOptions: boolean) {
  return showOptions || count > 0
}

export const weaponPieceMatches = (pieceName: string, profileName: string) =>
  sameWargear(pieceName, profileName) || wargearKey(pieceName) === wargearKey(profileName, true)

export function uniqueWeaponProfiles(profiles: readonly WeaponProfileData[]) {
  return uniqueBy(profiles, (profile) =>
    JSON.stringify({ name: profile.name.trim().toLocaleLowerCase(), type: profile.type, values: profile.values }),
  )
}

export const weaponProfileNames = (profile: WeaponProfileData) =>
  profile.equipmentName ? [profile.name, profile.equipmentName] : [profile.name]

export function weaponProfilesFor(option: { name: string; pieces?: readonly string[] }, profiles: readonly WeaponProfileData[]) {
  return uniqueWeaponProfiles(
    option.pieces?.length
      ? option.pieces.flatMap((name) =>
          profiles.filter((profile) => weaponProfileNames(profile).some((candidate) => weaponPieceMatches(name, candidate))),
        )
      : profiles.filter((profile) => weaponProfileNames(profile).some((name) => optionNameMatches(option.name, name))),
  )
}

/**
 * Whether a wargear option and a profile or rule are the same thing.
 *
 * Either may be the longer name: the option can be a pairing that contains the rule's
 * name, and the profile can be the option plus a mode — parenthesised, or marked and
 * suffixed the way the source prints a missile launcher's "➤ Missile Launcher - Frag".
 */
export function optionNameMatches(optionName: string, candidateName: string) {
  const normalize = (name: string) =>
    name
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim()
      .toLocaleLowerCase()
      .replaceAll(/\s+/g, '')
  const option = normalize(optionName)
  const candidate = normalize(candidateName)
  const baseCandidate = normalize(wargearBaseName(candidateName))
  const modeOf = candidate.startsWith(option) ? candidate.slice(option.length) : null
  return (
    candidate === option ||
    (modeOf !== null && /^[^\p{L}\p{N}]/u.test(modeOf)) ||
    option.includes(candidate) ||
    option.includes(baseCandidate)
  )
}

export const defaultFirst = <T extends { default?: boolean }>(entries: readonly T[]) =>
  entries.toSorted((one, other) => Number(Boolean(other.default)) - Number(Boolean(one.default)))

export function orderedModelWargear(model: LoadoutModel, choices: readonly LoadoutChoice[], weapons: readonly WeaponProfileData[]) {
  return defaultFirst(
    ordered(
      [
        ...model.fixed.map((entry) => ({ name: entry.name, fixed: entry, default: true })),
        ...model.rows.flatMap((row) => {
          const pieces = modelRowPieces(row, model.rows)
          return (row.separatePieces ? pieces.map((name) => ({ name, pieces: [name] })) : [{ name: row.name, pieces }]).map((entry) => ({
            ...entry,
            row,
            default: loadoutRowSources(row, choices).some(({ option }) => option.default),
          }))
        }),
      ],
      weapons,
      (entry) => ('row' in entry && !entry.row.separatePieces ? `choice:${entry.row.choiceKey}` : `wargear:${entry.name}`),
    ),
  )
}

export function ordered<T extends { name: string }>(
  entries: readonly T[],
  weapons: readonly WeaponProfileData[],
  clusterOf: (entry: T) => string,
) {
  return [...groupBy(entries, clusterOf).values()]
    .map((cluster) => ({ melee: isMelee(cluster[0]!.name, weapons), entries: cluster }))
    .toSorted((one, other) => Number(one.melee) - Number(other.melee))
    .flatMap((cluster) => cluster.entries)
}

const profilesFor = (name: string, weapons: readonly WeaponProfileData[]) =>
  weapons.filter((weapon) => weaponProfileNames(weapon).some((candidate) => optionNameMatches(name, candidate)))

// A combi-weapon has a melee profile and is still a gun, so what it also does cannot
// decide where it goes.
const isMelee = (name: string, weapons: readonly WeaponProfileData[]) =>
  profilesFor(name, weapons).some((weapon) => weapon.type === 'Melee Weapons') &&
  !profilesFor(name, weapons).some((weapon) => weapon.type === 'Ranged Weapons')

/**
 * The questions the unit answers as a whole, in the order a datasheet asks them.
 *
 * What it fights with first, then what else it carries: an Overlord picks his blade
 * before he decides about the resurrection orb, which is the order the datasheet
 * prints and the order the question actually gets asked in. A group is a weapon group
 * when any of its options has a profile, since the point of the group is usually that
 * one of them is a weapon and another is not.
 */
export function orderedChoices<T extends { options: readonly { name: string }[] }>(
  choices: readonly T[],
  weapons: readonly WeaponProfileData[],
) {
  const band = (choice: T) => {
    const names = choice.options.map((option) => option.name)
    if (!names.some((name) => profilesFor(name, weapons).length)) return 2
    return names.every((name) => isMelee(name, weapons)) ? 1 : 0
  }
  return choices
    .map((choice, at) => ({ choice, at, band: band(choice) }))
    .toSorted((one, other) => one.band - other.band || one.at - other.at)
    .map((entry) => entry.choice)
}

/**
 * Every model in the squad holding the same option, which is what a uniform group is.
 *
 * The group is still one slot per model, so answering it is still a spread — it is the
 * question that is asked once, not the wargear that is issued once.
 */
export const wholeSquadTakes = (choice: LoadoutChoice, optionId: string): SpreadCounts =>
  Object.fromEntries(choice.options.map((option) => [option.id, option.id === optionId ? choice.room : 0]))

const takenIn = (choice: LoadoutChoice) => choice.options.reduce((total, option) => total + option.count, 0)

/**
 * Whether a group may simply give a slot up, or has to hand it to one of its own.
 *
 * A squad of ten always holds ten weapons, so putting one down means picking another
 * up. A group the datasheet only offers — two of the five may take a special weapon —
 * is under no such obligation, and moving the slot sideways there arms a squadmate the
 * player never asked to arm.
 */
const shedsSlot = (choice: LoadoutChoice) => choice.optional || takenIn(choice) < choice.room

/**
 * A group the squad divides between its options, a count at a time.
 *
 * The group is always full — every model carries something — so adding one of an
 * option takes one off whichever option has the most to give. That is what the
 * datasheet says in words: each model may replace its blaster with a carbine.
 */
export function spreadHandlers(choice: LoadoutChoice, saved?: SpreadCounts) {
  const taken = takenIn(choice)
  const held = (counts: SpreadCounts, option: LoadoutOption) => counts[option.id] ?? 0
  const total = (counts: SpreadCounts) => choice.options.reduce((sum, option) => sum + held(counts, option), 0)
  const priority = (counts: SpreadCounts) => (left: LoadoutOption, right: LoadoutOption) =>
    Number(Boolean(right.default)) - Number(Boolean(left.default)) || held(counts, right) - held(counts, left)
  const pressed = pressedCounts(choice, saved)
  const offered = (update: SpreadUpdate): SpreadUpdate | undefined => (update(pressed) ? update : undefined)

  const more = (option: LoadoutOption) =>
    offered((counts) => {
      const current = held(counts, option)
      if (current >= option.max) return null
      if (total(counts) < choice.room) return { [option.id]: current + 1 }
      const giving = choice.options
        .filter(
          (candidate) =>
            candidate.id !== option.id &&
            (held(counts, candidate) > candidate.min || (candidate.mutableMin && held(counts, candidate) > 0)),
        )
        .toSorted(priority(counts))[0]
      return giving ? { [option.id]: current + 1, [giving.id]: held(counts, giving) - 1 } : null
    })

  const less = (option: LoadoutOption) =>
    offered((counts) => {
      const current = held(counts, option)
      if (current <= option.min) return null
      if (choice.optional || total(counts) < choice.room) return { [option.id]: current - 1 }
      // A full group has to hand the freed slot to a sibling, and only one still
      // under its own cap can take it. Nine bolt rifles and a special weapon cannot
      // become ten bolt rifles.
      const receiving = choice.options
        .filter((candidate) => candidate.id !== option.id && held(counts, candidate) < candidate.max)
        .toSorted(priority(counts))[0]
      return receiving ? { [option.id]: current - 1, [receiving.id]: held(counts, receiving) + 1 } : null
    })

  return { taken, more, less }
}

/** Why a disabled add cannot take one more of an option, in the counts the player sees. */
export function increaseBlocked(choice: LoadoutChoice, option: LoadoutOption) {
  if (option.count >= option.max) return `Max ${option.max}`
  const taken = takenIn(choice)
  return taken >= choice.room ? `Group full: ${taken}/${choice.room}` : null
}

/** A press that folds a change into a group's live counts, or nothing to press. */
export function changeBy(update: SpreadUpdate | undefined, key: string, onSpread: (key: string, update: SpreadUpdate) => void) {
  return update ? () => onSpread(key, update) : undefined
}

/**
 * Turn a result drawn from the priced answer into the equivalent live change.
 *
 * `freed` bodies left groups nested under this one in the same press; caps were read
 * against the smaller room the group had while they stood there, so they grow by it.
 */
export function relativeSpread(choice: LoadoutChoice, wanted: SpreadCounts, freed = 0): SpreadUpdate {
  const deltas = Object.fromEntries(
    Object.entries(wanted).map(([id, count]) => [id, count - (choice.options.find((option) => option.id === id)?.count ?? 0)]),
  )
  return (counts) => {
    const next = Object.fromEntries(Object.entries(deltas).map(([id, delta]) => [id, (counts[id] ?? 0) + delta]))
    const valid = Object.entries(next).every(([id, count]) => {
      const option = choice.options.find((candidate) => candidate.id === id)
      return count >= 0 && count <= (option?.max ?? 0) + freed
    })
    return valid ? next : null
  }
}

/** A press's group changes as live updates, each group given the room its nested groups freed. */
export function poolChangeUpdates(change: PoolChange, choices: readonly LoadoutChoice[]): [string, SpreadUpdate][] {
  const lowered = (key: string, counts: SpreadCounts) => {
    const choice = choices.find((candidate) => candidate.key === key)
    return Object.entries(counts).reduce(
      (total, [id, count]) => total + Math.max(0, (choice?.options.find((option) => option.id === id)?.count ?? 0) - count),
      0,
    )
  }
  return change.flatMap(([key, counts]) => {
    const choice = choices.find((candidate) => candidate.key === key)
    if (!choice) return []
    const freed = change.reduce((total, [other, held]) => total + (other.startsWith(`${key}/`) ? lowered(other, held) : 0), 0)
    return [[key, relativeSpread(choice, counts, freed)]]
  })
}

/** Whether an option is one of the bodies this card counts, rather than wargear on one. */
export const addsModel = (model: LoadoutModel, source: LoadoutRowSource) =>
  model.members.some((member) => member.choiceKey === source.choice.key && member.id === source.option.id)

/** The counts a press leaves behind, group by group. */
export type PoolChange = [string, SpreadCounts][]

/** How many models of this kind the unit holds, read from the choices its members point at. */
export function modelCount(model: LoadoutModel, choices: readonly LoadoutChoice[]) {
  return model.members.reduce((total, member) => {
    if (!member.choiceKey) return total + member.baseCount
    return total + (findOption(choices, member.choiceKey, member.id)?.option.count ?? 0)
  }, 0)
}

/**
 * Giving and taking a weapon on one card, where every row draws on the same bodies.
 *
 * Every weapon this kind of model counts by is one of its bodies holding that weapon,
 * so they all draw on the same pool however the catalogue files them. Rebalancing
 * within a single group would leave a veteran unable to put down a pyrecannon and pick
 * his bolt rifle back up, because the two are written in different places.
 */
export function poolHandlers(model: LoadoutModel, choices: readonly LoadoutChoice[], weapons: readonly WeaponProfileData[]) {
  const count = modelCount(model, choices)
  const rowCount = (row: ModelRow) => loadoutRowCount(row, choices)
  const bandOf = (row: ModelRow) => loadoutRowBand(row, weapons)
  const participates = (row: ModelRow, choiceKey: string) => row.choiceKey === choiceKey || modelRowPieces(row, model.rows).length > 0
  const shared = model.rows.flatMap((row) =>
    loadoutRowSources(row, choices).flatMap((found) => (found.choice.room > 1 || found.choice.carried ? [{ row, ...found }] : [])),
  )
  type Entry = (typeof shared)[number]

  const factoredMove = (row: ModelRow, adding: boolean): PoolChange | null | undefined => {
    const sources = loadoutRowSources(row, choices)
    const choice = sources[0]?.choice
    if (!choice || sources.some((source) => source.choice !== choice)) return undefined
    const ids = new Set(sources.map((source) => source.option.id))
    const sharedSource = sources.some(({ option }) =>
      model.rows.some(
        (other) =>
          other !== row && modelRowSources(other).some((source) => source.choiceKey === choice.key && source.optionId === option.id),
      ),
    )
    if (!sharedSource || choice.options.some((option) => !option.pieces?.length)) return undefined

    const targets = adding
      ? sources.filter(({ option }) => option.count < option.max)
      : sources.filter(({ option }) => option.count > option.min)
    const others = choice.options.filter((option) => !ids.has(option.id))
    const candidates = adding
      ? targets.flatMap(({ option: target }) =>
          others.filter((donor) => donor.count > donor.min || (donor.mutableMin && donor.count > 0)).map((donor) => ({ target, donor })),
        )
      : targets.flatMap(({ option: donor }) => others.filter((target) => target.count < target.max).map((target) => ({ target, donor })))
    const withoutRow = (pieces: readonly string[]) => pieces.filter((piece) => !sameWargear(piece, row.name))
    const distance = ({ target, donor }: (typeof candidates)[number]) => {
      const from = adding ? donor.pieces! : withoutRow(donor.pieces!)
      const to = adding ? withoutRow(target.pieces!) : target.pieces!
      return (
        from.filter((piece) => !to.some((candidate) => sameWargear(piece, candidate))).length +
        to.filter((piece) => !from.some((candidate) => sameWargear(piece, candidate))).length
      )
    }
    const overlap = ({ target, donor }: (typeof candidates)[number]) => {
      const from = adding ? donor.pieces! : withoutRow(donor.pieces!)
      const to = adding ? withoutRow(target.pieces!) : target.pieces!
      return from.filter((piece) => to.some((candidate) => sameWargear(piece, candidate))).length
    }
    const moved = candidates.toSorted(
      (left, right) =>
        distance(left) - distance(right) ||
        overlap(right) - overlap(left) ||
        Number(Boolean(right.target.default)) - Number(Boolean(left.target.default)) ||
        right.donor.count - left.donor.count,
    )[0]
    return moved ? [[choice.key, { [moved.target.id]: moved.target.count + 1, [moved.donor.id]: moved.donor.count - 1 }]] : null
  }

  const move = (from: readonly Entry[], to: readonly Entry[]): PoolChange => {
    const wanted = new Map<string, SpreadCounts>()
    for (const [entry, delta] of [...from.map((one) => [one, -1] as const), ...to.map((one) => [one, 1] as const)]) {
      const counts = wanted.get(entry.choice.key) ?? {}
      counts[entry.option.id] = entry.option.count + delta
      wanted.set(entry.choice.key, counts)
    }
    for (const [entry, delta, others] of [
      ...from.map((source) => [source, -1, to] as const),
      ...to.map((source) => [source, 1, from] as const),
    ]) {
      const carrier = model.members.find((member) => member.id === entry.choice.owner?.id && member.choiceKey)
      if (!carrier || !others.some((other) => addsModel(model, other) && other.option.id !== carrier.id)) continue
      const held = findOption(choices, carrier.choiceKey, carrier.id)?.option.count ?? 0
      for (const choice of choices) {
        if (choice.owner?.id !== carrier.id || wanted.has(choice.key)) continue
        if (delta < 0 ? takenIn(choice) < held : choice.optional || takenIn(choice) > held) continue
        const sibling = choice.options
          .filter((option) => (delta < 0 ? option.count > 0 : option.count < option.max))
          .toSorted(donorPriority)[0]
        if (sibling) wanted.set(choice.key, { [sibling.id]: sibling.count + delta })
      }
    }
    withSquadBodies(wanted, from, to)
    return [...wanted]
  }

  const carrierOf = (choice: LoadoutChoice) => {
    const member = model.members.find((candidate) => candidate.id === choice.owner?.id && candidate.choiceKey)
    const found = findOption(choices, member?.choiceKey, member?.id)
    return found && { group: found.choice, option: found.option }
  }
  const enclosingSquad = (key: string) =>
    choices
      .filter((candidate) => key.startsWith(`${candidate.key}/`) && model.members.some((member) => member.choiceKey === candidate.key))
      .toSorted((one, other) => other.key.length - one.key.length)[0]

  /**
   * The squad group's own counts for a weapon that brings or takes a body with it.
   *
   * Arming an absent carrier, or adding a specialist filed in a group nested under the
   * squad, puts a model in the squad that its group never counted; the build makes room
   * by dropping a default model.
   */
  const withSquadBodies = (wanted: Map<string, SpreadCounts>, from: readonly Entry[], to: readonly Entry[]) => {
    const countIn = (group: LoadoutChoice, option: LoadoutOption) => wanted.get(group.key)?.[option.id] ?? option.count
    const set = (group: LoadoutChoice, option: LoadoutOption, next: number) =>
      wanted.set(group.key, { ...wanted.get(group.key), [option.id]: next })
    const nested = new Map<LoadoutChoice, number>()
    const pinned = new Set([...from, ...to].map((entry) => entry.option))
    for (const [entry, delta] of [...from.map((one) => [one, -1] as const), ...to.map((one) => [one, 1] as const)]) {
      const carrier = carrierOf(entry.choice)
      if (carrier) {
        const held = carrier.option.count
        const taken = entry.choice.options.reduce((total, option) => total + countIn(entry.choice, option), 0)
        // Each carrier holds one of a group it may not leave empty, so an optional carrier
        // arrives with its weapon and leaves with it; an optional group only needs one there.
        const target = entry.choice.optional ? Math.max(held, Math.min(taken, 1)) : carrier.option.min === 0 ? taken : Math.max(held, taken)
        if (target === held) continue
        set(carrier.group, carrier.option, target)
        pinned.add(carrier.option)
        nested.set(carrier.group, nested.get(carrier.group) ?? 0)
        continue
      }
      const squad = addsModel(model, entry) ? enclosingSquad(entry.choice.key) : undefined
      if (squad) nested.set(squad, (nested.get(squad) ?? 0) + delta)
    }
    for (const [squad, arriving] of nested) {
      let excess = squad.options.reduce((total, option) => total + countIn(squad, option), 0) - (squad.room - arriving)
      if (excess < 0 && squad.optional) continue
      // Caps were read against the room before this change, so they grow with the room a leaving body frees.
      const adjustable = squad.options
        .filter((option) => !pinned.has(option))
        .map((option) => ({ ...option, count: countIn(squad, option), max: option.max - Math.min(0, arriving) }))
        .filter((option) => (excess > 0 ? option.count > option.min : option.count < option.max))
        .toSorted(donorPriority)
      for (const option of adjustable) {
        if (!excess) break
        const step = excess > 0 ? Math.min(excess, option.count - option.min) : Math.max(excess, option.count - option.max)
        set(squad, option, option.count - step)
        excess -= step
      }
    }
  }
  const sameSource = (one: Entry, other: Entry) => one.choice.key === other.choice.key && one.option.id === other.option.id

  const spend = (taker: Entry): PoolChange | null => {
    // A group with no room left gives up one of its own: the veteran holding the
    // pyrecannon is the one who puts it down for a heavy bolter, and asking a
    // squadmate with a bolt rifle instead would put a second special weapon in a
    // squad allowed one.
    const kin = shared.filter((entry) => entry.choice.key === taker.choice.key)
    const full = takenIn(taker.choice) >= taker.choice.room
    const band = bandOf(taker.row)
    const sharesPool = (row: ModelRow) => row.choiceKey === taker.choice.key || bandOf(row) === band
    const pool =
      full && !addsModel(model, taker) ? kin : shared.filter((entry) => sharesPool(entry.row) && participates(entry.row, taker.choice.key))
    const occupied = model.rows
      .filter((row) => sharesPool(row) && participates(row, taker.choice.key))
      .reduce((total, row) => total + rowCount(row), 0)
    // A model option with room joins the squad; it does not replace another
    // specialist on this card. The squad's model group supplies the body.
    if (!full && addsModel(model, taker) && canAddPooledOption(taker.option)) return move([], [taker])
    const giver = pool
      .filter((entry) => !sameSource(entry, taker) && entry.option.count > 0 && canAddPooledOption(taker.option, entry))
      .toSorted((one, other) => donorPriority(one.option, other.option))[0]
    if (!full && occupied < count) return canAddPooledOption(taker.option) ? move([], [taker]) : null
    if (giver) return move([giver], [taker])
    if (!full) return canAddPooledOption(taker.option) ? move([], [taker]) : null
    // Nobody on this card can make way, as the standard bearer's card holds no Scions,
    // so the squad's own model group gives up a body the way its heading would.
    const donor = addsModel(model, taker)
      ? taker.choice.options
          .filter((option) => option.id !== taker.option.id && (option.count > option.min || (option.mutableMin && option.count > 0)))
          .toSorted(donorPriority)[0]
      : undefined
    return donor && canAddPooledOption(taker.option)
      ? [[taker.choice.key, { [taker.option.id]: taker.option.count + 1, [donor.id]: donor.count - 1 }]]
      : null
  }

  const free = (giver: Entry) => {
    if (giver.option.count <= 0 || giver.option.count <= giver.option.min) return null
    const requiredSlot = !giver.choice.optional && !addsModel(model, giver) && takenIn(giver.choice) <= Math.min(giver.choice.room, count)
    const taker = shared
      .filter((entry) => !requiredSlot || entry.option.default)
      .filter((entry) => participates(entry.row, giver.choice.key))
      .filter((entry) => entry.choice.key === giver.choice.key || bandOf(entry.row) === bandOf(giver.row))
      .filter((entry) => !sameSource(entry, giver) && canAddPooledOption(entry.option, giver))
      .toSorted((one, other) => donorPriority(one.option, other.option))[0]
    // A group that has to stay full hands the slot to one of its own, and a group that
    // does not hands it back to the loadout the catalogue starts the squad with. Where
    // a group is nothing but specialists — the two Plague Marines who may take a
    // special weapon — there is nobody to hand it to, and arming a squadmate the
    // player never asked to arm is not what putting a weapon down means.
    const handed = taker && (!shedsSlot(giver.choice) || taker.option.default)
    return handed ? move([giver], [taker]) : requiredSlot ? null : move([giver], [])
  }

  /** The change a row's button makes, or nothing when that row cannot give or take. */
  const press = (decide: (entry: Entry) => PoolChange | null) => (row: ModelRow) => {
    for (const entry of shared.filter((candidate) => candidate.row === row)) {
      const changes = decide(entry)
      if (changes) return changes
    }
    return null
  }

  const pooledSpend = press(spend)
  const pooledFree = press(free)
  const factoredOr = (row: ModelRow, adding: boolean, fallback: (row: ModelRow) => PoolChange | null) => {
    const moved = factoredMove(row, adding)
    return moved === undefined ? fallback(row) : moved
  }
  return {
    spend: (row: ModelRow) => factoredOr(row, true, pooledSpend),
    free: (row: ModelRow) => factoredOr(row, false, pooledFree),
  }
}
