import { UNIT_NICKNAME_MAX_LENGTH } from './unitNotes'

export type TextRoster = {
  name: string
  faction: string
  detachment: string | null
  disposition: string | null
  limit: number | null
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
  nickname?: string
  unread?: string[]
  warlord: boolean
}

/** A nickname as one bounded line, whether it is being written into text or read back out. */
export const textNickname = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, UNIT_NICKNAME_MAX_LENGTH) || undefined
