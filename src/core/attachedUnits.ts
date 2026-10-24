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
