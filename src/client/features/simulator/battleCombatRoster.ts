import type { BattleView } from '../../../core/battleView'
import type { CombatRoster } from './useCombatant'

export function battleCombatRoster(player: Pick<BattleView['players'][number], 'roster' | 'units' | 'name'>): CombatRoster | null {
  const built = player.roster?.built
  if (!built?.picks?.length) return null
  const units = built.picks.map((pick, index) => {
    const unit = player.units.find((candidate) => candidate.key === `${index}-${pick.entryId}`)
    return {
      key: unit?.key ?? `${index}-${pick.entryId}`,
      name: unit?.name ?? pick.entryId,
      models: unit?.alive ?? 0,
      startingModels: unit?.models ?? 0,
      damage: unit?.damage ?? 0,
      wounds: unit?.wounds,
      available: Boolean(unit && !unit.destroyed && unit.alive > 0 && unit.formation === 'battlefield'),
    }
  })
  const pickIndex = units.findIndex((unit) => unit.available)
  if (pickIndex < 0) return null
  return {
    catalogueId: built.catalogueId,
    detachmentIds: built.detachmentIds ?? [],
    disposition: built.disposition,
    limit: built.limit,
    picks: built.picks.map((pick, index) => ({
      ...pick,
      attachedTo:
        units[index]!.available && pick.attachedTo !== undefined && units[pick.attachedTo]?.available ? pick.attachedTo : undefined,
    })),
    pickIndex,
    waivedRules: built.waivedRules ?? [],
    borrowedDetachmentId: null,
    optionalRules: [],
    battle: { units },
  }
}
