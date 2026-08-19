export type TextRoster = {
  name: string
  faction: string
  detachment: string | null
  disposition: string | null
  limit: number | null
  units: TextRosterUnit[]
}

export type TextRosterUnit = {
  name: string
  selections: { name: string; count: number }[]
  leading: string | null
  leader?: string | null
  models?: number | null
  warlord: boolean
}
