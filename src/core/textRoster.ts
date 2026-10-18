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
  selections: { name: string; count: number }[]
  leading: string | null
  leader?: string | null
  models?: number | null
  entry?: number
  attachedToEntry?: number
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
