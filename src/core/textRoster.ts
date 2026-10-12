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
