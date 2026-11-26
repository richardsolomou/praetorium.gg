import { UNIT_NICKNAME_MAX_LENGTH, UNIT_NOTE_MAX_LENGTH } from './unitNotes'

export type TextRoster = {
  name: string
  faction: string
  detachment: string | null
  disposition: string | null
  limit: number | null
  /** The battle size the text names beside its points, when it names one. */
  sizeName?: string
  reportedPoints?: number
  /** The official app's data version the export was made from, as its footer's "Data Version: v995". */
  dataVersion?: number
  unread?: string[]
  units: TextRosterUnit[]
}

export type TextRosterUnit = {
  name: string
  /** `model` is the line a choice is nested under, where a layout lists each model's wargear beneath it. */
  selections: { name: string; count: number; model?: string }[]
  leading: string | null
  leader?: string | null
  models?: number | null
  /** The list prints no size, which means the datasheet's own rather than one read from its wargear. */
  defaultSize?: boolean
  entry?: number
  attachedToEntry?: number
  /** Units sharing a number are listed together as an attached group without saying which is the bodyguard. */
  group?: number
  nickname?: string
  /** The player's own note on the unit, kept as its private note. */
  note?: string
  /** A lone free-text line read as wargear, which is the player's note instead if nothing in the catalogue answers to it. */
  noteOrWargear?: string
  unread?: string[]
  warlord: boolean
}

/** What to call a list that does not name itself: its army and, when the text gives them, its points. */
export function defaultListName(faction: string, points: number | null | undefined) {
  const army = faction.split(' - ').at(-1)?.trim() || 'Imported roster'
  return points === null || points === undefined ? `${army} roster` : `${army} ${points}pts`
}

export type AttachedGroup = { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }

/** A group listed with its bodyguard last. */
export const bodyguardLast = (members: readonly TextRosterUnit[]): AttachedGroup => ({
  leaders: members.slice(0, -1),
  bodyguard: members.at(-1)!,
})

/**
 * Points each leader of a listed group at its bodyguard by entry number.
 *
 * The numbers start after any the text gives itself, so they cannot collide with them.
 */
export function attachGroups(units: readonly TextRosterUnit[], groups: readonly AttachedGroup[]) {
  let entry = Math.max(0, ...units.map((unit) => unit.entry ?? 0))
  for (const { leaders, bodyguard } of groups) {
    if (!leaders.length) continue
    bodyguard.entry = ++entry
    for (const leader of leaders) leader.attachedToEntry = entry
  }
}

/** Records a unit listed as attached under `host`, keeping one group for each bodyguard. */
export function joinGroup(groups: AttachedGroup[], host: TextRosterUnit, unit: TextRosterUnit) {
  const group = groups.find((candidate) => candidate.bodyguard === host)
  if (group) group.leaders.push(unit)
  else groups.push({ leaders: [unit], bodyguard: host })
}

/** Wargear pieces, each taking the count it starts with, as "9 Pistolet bolter". */
export function addCountedPieces(unit: TextRosterUnit, pieces: readonly string[]) {
  for (const piece of pieces.filter(Boolean)) {
    const counted = piece.match(/^(\d+)\s+(.+)$/)
    unit.selections.push({ name: counted?.[2] ?? piece, count: Number(counted?.[1] ?? 1) })
  }
}

/** A section heading in the unit lists of WTC-style text. */
export const WTC_SECTION =
  /^(?:ATTACHED UNITS?|CHARACTERS?|EPIC HER(?:O|OES)|BATTLELINE|DEDICATED TRANSPORTS?|OTHER DATASHEETS|ALLIED UNITS)$/i

/**
 * A labelled line whose bullet is written as another mark, as the official app's "* Attached as: Leader (Character)" or
 * a hand edit's ". Attached as: Leader (Character)", as the bullet it stands for. Only labelled lines are read this way:
 * the app's footnotes, as "* This Datasheet also has the Battleline keyword", carry no label, and a marked counted line
 * can be a unit, as ". 10x Necron Warriors (110 pts)".
 */
export const strayBullet = (line: string) => line.replace(/^(\s*)(?:\*\s*|[.·]\s+)(?=[^:*]+:\s*\S)/, '$1• ')

/**
 * The pieces a model's wargear line lists, split at each comma and at each "and" that starts a new, capitalised piece,
 * since a piece's own name can hold a lower-case "and", as "Hybrid firearm and cult icon".
 */
export const listedPieces = (line: string) => line.split(/,\s+|\s+and\s+(?=[\p{Lu}\d])/u).filter(Boolean)

/** A nickname as one bounded line, whether it is being written into text or read back out. */
export const textNickname = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, UNIT_NICKNAME_MAX_LENGTH) || undefined

/** A unit note as one bounded block, with each line trimmed. */
export const textNote = (lines: readonly string[]) =>
  lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, UNIT_NOTE_MAX_LENGTH) || undefined
