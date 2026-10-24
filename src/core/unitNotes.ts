import type { Roster } from './battle'

export const UNIT_NICKNAME_MAX_LENGTH = 40
export const UNIT_NOTE_MAX_LENGTH = 500

/** A nickname never replaces the datasheet name, so a reader can still tell what the unit is. */
export const nicknamedUnit = (name: string, nickname?: string) => (nickname ? `${nickname} · ${name}` : name)

/** The same units or picks with their owner's notes taken out, for every read by somebody else; nicknames stay. */
export function withoutUnitNotes<T extends { note?: string }>(items: readonly T[]): T[] {
  return items.map((item) => {
    if (item.note === undefined) return item
    const { note: _note, ...rest } = item
    return rest as T
  })
}

/** A frozen army without its owner's unit notes. */
export function rosterWithoutUnitNotes<T extends Pick<Roster, 'built'>>(roster: T): T {
  const { built } = roster
  if (!built) return roster
  return {
    ...roster,
    built: { ...built, units: withoutUnitNotes(built.units), ...(built.picks ? { picks: withoutUnitNotes(built.picks) } : {}) },
  }
}
