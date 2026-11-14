import { attachedUnitList } from '../../../core/attachedUnits'
import type { UnitFormation, UnitState } from '../../../core/battle'
import type { Datasheet } from '../../../core/datasheet'
import type { RosterPick } from '../../../core/roster'
import { unitMove, unitRange } from '../../../core/unitReach'

type Sheet = Pick<Datasheet, 'profiles'>
/** What `combatantDatasheets` answers for one unit, as far as its reach needs. */
type Projection = { selected: Sheet; companions: readonly { selected: Sheet }[] } | null | undefined

export type Threat = {
  key: string
  name: string
  formation: UnitFormation
  /** Null when the unit's datasheet could not be read, as for a list frozen before battles kept loadouts. */
  move: number | null
  range: number | null
}

/**
 * The units an army still has, one row for each unit as the game counts it, and the
 * request that reads their datasheets.
 *
 * A destroyed unit is left out, and a leader whose bodyguard is gone stands alone.
 * A unit matches its pick by key, so a list frozen before battles kept loadouts has
 * no picks and asks for nothing.
 */
export function survivingUnits(units: readonly UnitState[], picks: readonly RosterPick[] = []) {
  const pickOf = (unit: UnitState) => {
    const index = picks.findIndex((pick, at) => unit.entryId === pick.entryId && unit.key === `${at}-${pick.entryId}`)
    return index < 0 ? null : index
  }
  const standing = units.filter((unit) => !unit.destroyed)
  const active = picks.map((_, index) => standing.some((unit) => pickOf(unit) === index))
  const rows = attachedUnitList(standing).map(({ host, joined }) => ({
    key: host.key,
    name: [host, ...joined].map((unit) => unit.name).join(' + '),
    formation: host.formation,
    pickIndex: pickOf(host),
  }))
  return {
    rows,
    request: {
      // As the simulator fields a battle army: an attachment holds only while both halves stand.
      picks: picks.map((pick, index) => ({
        ...pick,
        attachedTo: active[index] && pick.attachedTo !== undefined && active[pick.attachedTo] ? pick.attachedTo : undefined,
      })),
      pickIndices: rows.flatMap((row) => (row.pickIndex === null ? [] : [row.pickIndex])),
      inactivePicks: active.flatMap((stands, index) => (stands ? [] : [index])),
    },
  }
}

/**
 * Each surviving unit with its Move and longest ranged weapon, the furthest-reaching first.
 *
 * `projections` answer `pickIndices` in order. A unit with no numbers goes last, in list order.
 */
export function armyThreats(rows: ReturnType<typeof survivingUnits>['rows'], projections: readonly Projection[] = []): Threat[] {
  let read = 0
  const threats = rows.map(({ key, name, formation, pickIndex }) => {
    const projection = pickIndex === null ? null : projections[read++]
    if (!projection) return { key, name, formation, move: null, range: null }
    const unit = { sheet: projection.selected, companions: projection.companions.map((member) => ({ sheet: member.selected })) }
    return { key, name, formation, move: unitMove(unit), range: unitRange(unit) }
  })
  return threats.toSorted((first, second) => (threatReach(second) ?? -1) - (threatReach(first) ?? -1))
}

/**
 * How far a unit's shooting reaches after a normal move, or null for a unit off the battlefield,
 * whose reach depends on where it arrives or disembarks rather than on its Move.
 */
export const threatReach = (threat: Threat) =>
  threat.move === null || threat.formation !== 'battlefield' ? null : threat.move + (threat.range ?? 0)
