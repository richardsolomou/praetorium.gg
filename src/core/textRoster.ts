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
  nickname?: string
  /** The player's own note on the unit, kept as its private note. */
  note?: string
  /** A lone free-text line read as wargear, which is the player's note instead if nothing in the catalogue answers to it. */
  noteOrWargear?: string
  unread?: string[]
  warlord: boolean
}

/**
 * Points each leader of a listed group at its bodyguard by entry number.
 *
 * The numbers start after any the text gives itself, so they cannot collide with them.
 */
export function attachGroups(
  units: readonly TextRosterUnit[],
  groups: readonly { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }[],
) {
  let entry = Math.max(0, ...units.map((unit) => unit.entry ?? 0))
  for (const { leaders, bodyguard } of groups) {
    if (!leaders.length) continue
    bodyguard.entry = ++entry
    for (const leader of leaders) leader.attachedToEntry = entry
  }
}

/** A section heading in the unit lists of WTC-style text. */
export const WTC_SECTION =
  /^(?:ATTACHED UNITS?|CHARACTERS?|EPIC HER(?:O|OES)|BATTLELINE|DEDICATED TRANSPORTS?|OTHER DATASHEETS|ALLIED UNITS)$/i

/**
 * A labelled line the official app marks with an asterisk, as "* Attached as: Leader (Character)", as the bullet it stands for.
 * The app's footnotes, as "* This Datasheet also has the Battleline keyword", carry no label.
 */
export const starredLabel = (line: string) => line.replace(/^(\s*)\*\s*(?=[^:*]+:\s*\S)/, '$1• ')

/** A nickname as one bounded line, whether it is being written into text or read back out. */
export const textNickname = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, UNIT_NICKNAME_MAX_LENGTH) || undefined

/** A unit note as one bounded block, with each line trimmed. */
export const textNote = (lines: readonly string[]) =>
  lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, UNIT_NOTE_MAX_LENGTH) || undefined
