import type { Datasheet } from '../../../server/catalogue'
import { modelRowCount, modelRowPieces, modelRowSources, type ModelKind, type ModelRow } from '../../../core/modelKinds'
import { sameWargear, wargearBaseName } from '../../../core/wargear'

export { sameWargear as sameWeapon } from '../../../core/wargear'

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

export function loadoutInstructions(
  row: Pick<ModelRow, 'name' | 'pieces'>,
  model: LoadoutModel,
  models: readonly LoadoutModel[],
  groups: NonNullable<Datasheet['wargearGroups']>,
) {
  const names = row.pieces ?? [row.name]
  const candidates = groups.flatMap((group) => {
    if (group.instruction === 'Default Wargear') return []
    const namedModels = models.filter((candidate) =>
      new RegExp(`\\b${candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s\\b|\\b)`, 'i').test(group.instruction),
    )
    if (namedModels.length && !namedModels.includes(model)) return []
    const matches = group.options.filter((option) => names.some((name) => sameWargear(wargearBaseName(option), name))).length
    return matches ? [{ instruction: group.instruction, matches }] : []
  })
  const best = Math.max(0, ...candidates.map((candidate) => candidate.matches))
  return [...new Set(candidates.filter((candidate) => candidate.matches === best).map((candidate) => candidate.instruction))]
}

export type LoadoutRowSource = { choice: LoadoutChoice; option: LoadoutOption }

export function loadoutRowSources(row: ModelRow, choices: readonly LoadoutChoice[]): LoadoutRowSource[] {
  return modelRowSources(row).flatMap((source) => {
    const choice = choices.find((candidate) => candidate.key === source.choiceKey)
    const option = choice?.options.find((candidate) => candidate.id === source.optionId)
    return choice && option ? [{ choice, option }] : []
  })
}

export const loadoutRowCount = (row: ModelRow, choices: readonly LoadoutChoice[]) =>
  modelRowCount(row, ({ choiceKey, optionId }) => {
    const choice = choices.find((candidate) => candidate.key === choiceKey)
    return choice?.options.find((candidate) => candidate.id === optionId)?.count ?? 0
  })

export function loadoutRowBand(row: ModelRow, profiles: readonly WeaponProfileData[]) {
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

export type ChoiceEdit = { key: string; optionId: string } | { key: string; counts: SpreadCounts }

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

export function weaponMatches(optionName: string, profileName: string) {
  return named(optionName, profileName)
}

export function controlledProfileCount(
  choices: readonly { options: readonly Pick<LoadoutOption, 'name' | 'count' | 'pieceCounts'>[] }[],
  profileName: string,
) {
  return choices
    .flatMap((choice) => choice.options)
    .reduce((total, option) => {
      if (!option.count) return total
      const pieces = option.pieceCounts
        ?.filter((piece) => weaponMatches(piece.name, profileName))
        .reduce((count, piece) => count + piece.count, 0)
      return total + Math.max(pieces ?? 0, weaponMatches(option.name, profileName) ? option.count : 0)
    }, 0)
}

export function wargearMatches(optionName: string, abilityName: string) {
  return named(optionName, abilityName)
}

export function uniqueWeaponProfiles(profiles: readonly WeaponProfileData[]) {
  const seen = new Set<string>()
  return profiles.filter((profile) => {
    const signature = JSON.stringify({
      name: profile.name.trim().toLocaleLowerCase(),
      type: profile.type,
      values: profile.values,
    })
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}

export function weaponProfilesFor(option: { name: string; pieces?: readonly string[] }, profiles: readonly WeaponProfileData[]) {
  const names = [option.name, ...(option.pieces ?? [])]
  return uniqueWeaponProfiles(profiles.filter((profile) => names.some((name) => weaponMatches(name, profile.name))))
}

/**
 * Whether a wargear option and a profile or rule are the same thing.
 *
 * Either may be the longer name: the option can be a pairing that contains the rule's
 * name, and the profile can be the option plus a mode — parenthesised, or marked and
 * suffixed the way the source prints a missile launcher's "➤ Missile Launcher - Frag".
 */
function named(optionName: string, candidateName: string) {
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
  const clusters = new Map<string, { at: number; melee: boolean; entries: T[] }>()
  entries.forEach((entry, at) => {
    const key = clusterOf(entry)
    const cluster = clusters.get(key)
    if (cluster) cluster.entries.push(entry)
    else clusters.set(key, { at, melee: isMelee(entry.name, weapons), entries: [entry] })
  })
  return [...clusters.values()]
    .toSorted((one, other) => Number(one.melee) - Number(other.melee) || one.at - other.at)
    .flatMap((cluster) => cluster.entries)
}

const profilesFor = (name: string, weapons: readonly WeaponProfileData[]) => weapons.filter((weapon) => weaponMatches(name, weapon.name))

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
export function spreadHandlers(choice: LoadoutChoice) {
  const taken = takenIn(choice)
  const room = choice.room - taken

  const donor = (exclude: string) =>
    choice.options.filter((option) => option.id !== exclude && (option.count > option.min || option.mutableMin)).toSorted(donorPriority)[0]

  const more = (option: LoadoutOption): SpreadCounts | null => {
    if (option.count >= option.max) return null
    if (room > 0) return { [option.id]: option.count + 1 }
    const giving = donor(option.id)
    return giving ? { [option.id]: option.count + 1, [giving.id]: giving.count - 1 } : null
  }

  const less = (option: LoadoutOption): SpreadCounts | null => {
    if (option.count <= option.min) return null
    if (shedsSlot(choice)) return { [option.id]: option.count - 1 }
    // A full group has to hand the freed slot to a sibling, and only one still
    // under its own cap can take it. Nine bolt rifles and a special weapon cannot
    // become ten bolt rifles.
    const receiving = choice.options
      .filter((candidate) => candidate.id !== option.id && candidate.count < candidate.max)
      .toSorted(donorPriority)[0]
    return receiving ? { [option.id]: option.count - 1, [receiving.id]: receiving.count + 1 } : null
  }

  return { taken, more, less }
}

/** A press that hands a group the counts it would then hold, or nothing to press. */
export function changeBy(counts: SpreadCounts | null, key: string, onSpread: (key: string, counts: SpreadCounts) => void) {
  return counts ? () => onSpread(key, counts) : undefined
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
    const choice = choices.find((candidate) => candidate.key === member.choiceKey)
    return total + (choice?.options.find((candidate) => candidate.id === member.id)?.count ?? 0)
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
      const held =
        choices.find((choice) => choice.key === carrier.choiceKey)?.options.find((option) => option.id === carrier.id)?.count ?? 0
      for (const choice of choices) {
        if (choice.owner?.id !== carrier.id || wanted.has(choice.key)) continue
        if (delta < 0 ? takenIn(choice) < held : choice.optional || takenIn(choice) > held) continue
        const sibling = choice.options
          .filter((option) => (delta < 0 ? option.count > 0 : option.count < option.max))
          .toSorted(donorPriority)[0]
        if (sibling) wanted.set(choice.key, { [sibling.id]: sibling.count + delta })
      }
    }
    return [...wanted]
  }
  const sameSource = (one: Entry, other: Entry) => one.choice.key === other.choice.key && one.option.id === other.option.id

  const spend = (taker: Entry) => {
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
    return !full && canAddPooledOption(taker.option) ? move([], [taker]) : null
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

  return { spend: press(spend), free: press(free) }
}
