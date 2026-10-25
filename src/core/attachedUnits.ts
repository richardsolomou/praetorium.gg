type UnitKey = string | number
type Attached<Key extends UnitKey> = { key: Key; attachedTo?: Key }

type Deployable<Key extends UnitKey> = Attached<Key> & { formationOptions?: readonly string[]; prebattleRules?: readonly string[] }

/**
 * One attached unit, as the game counts units rather than as a list stores them.
 *
 * The joined unit is the host: an attached unit keeps the bodyguard's name and its
 * place on the shelf, which is where a player looks for it.
 */
export type AttachedUnit<T> = {
  host: T
  /** The characters attached to it, in the order the list keeps them. */
  joined: T[]
  formationOptions: string[]
  prebattleRules: string[]
}

/**
 * Every entry one attached unit is kept in, the host first.
 *
 * A character and the unit it joined are one unit once the armies are set, so where
 * they start is one answer for all of them. Asking it of the entry a player happened
 * to press would leave a Lord of Contagion in deep strike and his Plague Marines on
 * the battlefield — two halves of one unit in two places.
 *
 * A unit naming a host the log does not hold stands alone rather than disappearing.
 */
export function attachedUnits<T extends Attached<UnitKey>>(units: readonly T[], key: T['key']): T[] {
  const unit = units.find((candidate) => candidate.key === key)
  if (!unit) return []
  const host = attachedHost(units, unit)
  return [host, ...units.filter((candidate) => candidate !== host && attachedHost(units, candidate) === host)]
}

/**
 * The bodyguard unit at the bottom of a chain of attachments. A Loyal Protector joins a
 * Command Squad before that squad leads its bodyguard unit, so all three are one unit.
 * A loop has no bottom, so each unit in it stands alone.
 */
export function attachedHost<T extends Attached<UnitKey>>(units: readonly T[], unit: T): T {
  const seen = new Set<T>([unit])
  let host = unit
  for (;;) {
    const next = host.attachedTo === undefined ? undefined : units.find((candidate) => candidate.key === host.attachedTo)
    if (!next) return host
    if (seen.has(next)) return unit
    seen.add(next)
    host = next
  }
}

/** An army folded into the units it is actually played as, in list order. */
export function attachedUnitList<T extends Deployable<UnitKey>>(units: readonly T[]): AttachedUnit<T>[] {
  return units.flatMap((unit) => {
    const [host, ...joined] = attachedUnits(units, unit.key)
    if (!host || host.key !== unit.key) return []
    return [
      {
        host,
        joined,
        formationOptions: shared([host, ...joined], 'formationOptions'),
        prebattleRules: shared([host, ...joined], 'prebattleRules'),
      },
    ]
  })
}

export const attachedUnitCount = (units: readonly Attached<UnitKey>[]) => attachedUnitList(units).length

/** A list's picks in the space their `attachedTo` is written in: each one's position. */
const byPosition = (picks: readonly { attachedTo?: number }[]) => picks.map(({ attachedTo }, key) => ({ key, attachedTo }))

/** How many units a list fields, its picks named by position. */
export const listUnitCount = (picks: readonly { attachedTo?: number }[]) => attachedUnitCount(byPosition(picks))

/**
 * The other units in the list that are the same unit as this one, by position.
 *
 * An Attached unit is one unit however many entries the list keeps it in: the
 * bodyguard unit, its Leader, and its Support unit. So a
 * character reaches its siblings through the unit they all joined rather than
 * through each other — asking only what this entry is attached to would tell a
 * Chronomancer nothing about the Overlord standing beside it, and an enhancement
 * that speaks of the bearer's unit means every model in it.
 */
export function attachedUnit(units: readonly { attachedTo?: number }[], position: number): number[] {
  return attachedUnits(byPosition(units), position).flatMap(({ key }) => (key === position ? [] : [key]))
}

/** The position of the bodyguard unit a list entry is part of, following a Loyal Protector through its Command Squad. */
export function attachmentHost(units: readonly { attachedTo?: number }[], position: number): number {
  const positioned = byPosition(units)
  return positioned[position] ? attachedHost(positioned, positioned[position]).key : position
}

/** The list without one unit; anything attached to it stands alone rather than pointing at a gap. */
export function withoutUnit<T extends Attached<UnitKey>>(units: readonly T[], key: T['key']): T[] {
  return units.flatMap((unit) => (unit.key === key ? [] : [unit.attachedTo === key ? { ...unit, attachedTo: undefined } : unit]))
}

/** Counts the units an army plays after attached datasheets have formed one unit. */
export function battleUnitCounts<T extends Deployable<UnitKey> & { destroyed: boolean; deployed: boolean }>(units: readonly T[]) {
  return {
    total: attachedUnitCount(units),
    standing: attachedUnitCount(units.filter((unit) => !unit.destroyed)),
    deployed: attachedUnitCount(units.filter((unit) => unit.deployed && !unit.destroyed)),
  }
}

/**
 * What the whole unit can do, which is only what every unit in it can do.
 *
 * Deep Strike, Infiltrators and Scouts each ask that every model in the unit has the
 * ability, so a character carrying one brings nothing to a bodyguard unit without it,
 * and a character without one takes it from a bodyguard unit that has it.
 */
const shared = <T extends Deployable<UnitKey>>(units: readonly T[], field: 'formationOptions' | 'prebattleRules'): string[] =>
  [...(units[0]?.[field] ?? [])].filter((ability) => units.every((unit) => unit[field]?.includes(ability)))
