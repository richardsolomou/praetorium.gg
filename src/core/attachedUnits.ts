type Attached = { key: string; attachedTo?: string }

type Deployable = Attached & { formationOptions?: readonly string[]; prebattleRules?: readonly string[] }

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
export function attachedUnits<T extends Attached>(units: readonly T[], key: string): T[] {
  const unit = units.find((candidate) => candidate.key === key)
  if (!unit) return []
  const host = units.find((candidate) => candidate.key === unit.attachedTo) ?? unit
  return [host, ...units.filter((candidate) => candidate.key !== host.key && candidate.attachedTo === host.key)]
}

/** An army folded into the units it is actually played as, in list order. */
export function attachedUnitList<T extends Deployable>(units: readonly T[]): AttachedUnit<T>[] {
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

/** Counts the units an army plays after attached datasheets have formed one unit. */
export function battleUnitCounts<T extends Deployable & { destroyed: boolean; deployed: boolean }>(units: readonly T[]) {
  return {
    total: attachedUnitList(units).length,
    standing: attachedUnitList(units.filter((unit) => !unit.destroyed)).length,
    deployed: attachedUnitList(units.filter((unit) => unit.deployed && !unit.destroyed)).length,
  }
}

/**
 * What the whole unit can do, which is only what every unit in it can do.
 *
 * Deep Strike, Infiltrators and Scouts each ask that every model in the unit has the
 * ability, so a character carrying one brings nothing to a bodyguard unit without it,
 * and a character without one takes it from a bodyguard unit that has it.
 */
const shared = <T extends Deployable>(units: readonly T[], field: 'formationOptions' | 'prebattleRules'): string[] =>
  [...(units[0]?.[field] ?? [])].filter((ability) => units.every((unit) => unit[field]?.includes(ability)))
