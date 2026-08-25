import type { Datasheet } from '../../../server/catalogue'
import { modelRowCount, modelRowSources, type ModelKind, type ModelRow } from '../../../core/modelKinds'

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
    max: number
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
  /** Profiles for weapons the catalogue does not carry, from the source that names them. */
  modelWeapons?: Datasheet['profiles']
  /** Keyword rules for those weapons: they live in the game system, not the datasheet. */
  modelKeywordRules?: Datasheet['keywordRules']
  /** Rules for wargear that has no profile of its own, such as a shield. */
  modelAbilities?: Datasheet['abilities']
}

export type WeaponProfileData = Datasheet['profiles'][number]

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
  modelCount: number,
): LoadoutChoice | null {
  if (loadoutRowCount(row, choices) >= modelCount) return null
  for (const candidate of model.rows) {
    if (candidate === row || !candidate.pieces?.some((piece) => sameWeapon(row.name, piece))) continue
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

/** Editing shows every available option; a finished roster shows only what is held. */
export function showLoadoutEntry(count: number, showOptions: boolean) {
  return showOptions || count > 0
}

/**
 * Whether two profile names are the same weapon, whichever of them names its
 * profiles: "Staff of light" and "Staff of light (Melee)" are one staff.
 */
export function sameWeapon(one: string, other: string) {
  return baseWeaponName(one) === baseWeaponName(other)
}

const baseWeaponName = (name: string) => {
  const trimmed = name.trim()
  const marked = /^[^\p{L}\p{N}]+/u.test(trimmed)
  const unmarked = trimmed.replace(/^[^\p{L}\p{N}]+/u, '')
  const withoutMarkedMode = marked ? unmarked.replace(/\s+-\s+[^-]+$/, '') : unmarked
  return withoutMarkedMode
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLocaleLowerCase()
}

export function weaponMatches(optionName: string, profileName: string) {
  return named(optionName, profileName)
}

export function controlledProfileCount(choices: readonly LoadoutChoice[], profileName: string) {
  return choices
    .flatMap((choice) => choice.options)
    .reduce((total, option) => {
      const pieces = option.pieceCounts
        ?.filter((piece) => weaponMatches(piece.name, profileName))
        .reduce((count, piece) => count + piece.count, 0)
      const perSelection = Math.max(pieces ?? 0, weaponMatches(option.name, profileName) ? 1 : 0)
      return total + option.count * perSelection
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
  const baseCandidate = normalize(baseWeaponName(candidateName))
  const modeOf = candidate.startsWith(option) ? candidate.slice(option.length) : null
  return (
    candidate === option ||
    (modeOf !== null && /^[^\p{L}\p{N}]/u.test(modeOf)) ||
    option.includes(candidate) ||
    option.includes(baseCandidate)
  )
}

/**
 * Wargear in the order a datasheet prints it: everything shot with, then everything
 * swung with.
 *
 * Anything interchangeable travels together — the options of one group, and a swap
 * beside the weapon it replaces — so a choice is made without hunting up the card
 * for the thing to give up. A cluster takes its place from what it starts with, which
 * is why a combat knife sits with the bolt carbine it is traded for rather than down
 * among the melee weapons.
 */
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

/**
 * A group the squad divides between its options, a count at a time.
 *
 * The group is always full — every model carries something — so adding one of an
 * option takes one off whichever option has the most to give. That is what the
 * datasheet says in words: each model may replace its blaster with a carbine.
 */
export function spreadHandlers(choice: LoadoutChoice) {
  const taken = choice.options.reduce((total, option) => total + option.count, 0)
  const room = choice.room - taken

  const donor = (exclude: string) =>
    choice.options.filter((option) => option.id !== exclude && option.count > 0).toSorted((left, right) => right.count - left.count)[0]

  const more = (option: LoadoutOption): SpreadCounts | null => {
    if (option.count >= option.max) return null
    if (room > 0) return { [option.id]: option.count + 1 }
    const giving = donor(option.id)
    return giving ? { [option.id]: option.count + 1, [giving.id]: giving.count - 1 } : null
  }

  const less = (option: LoadoutOption): SpreadCounts | null => {
    if (option.count <= 0) return null
    if (choice.optional || taken < choice.room) return { [option.id]: option.count - 1 }
    // A full group has to hand the freed slot to a sibling, and only one still
    // under its own cap can take it. Nine bolt rifles and a special weapon cannot
    // become ten bolt rifles.
    const receiving = choice.options
      .filter((candidate) => candidate.id !== option.id && candidate.count < candidate.max)
      .toSorted((left, right) => right.count - left.count)[0]
    return receiving ? { [option.id]: option.count - 1, [receiving.id]: receiving.count + 1 } : null
  }

  return { taken, more, less }
}

/** A press that hands a group the counts it would then hold, or nothing to press. */
export function changeBy(counts: SpreadCounts | null, key: string, onSpread: (key: string, counts: SpreadCounts) => void) {
  return counts ? () => onSpread(key, counts) : undefined
}
