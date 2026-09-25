import { useState } from 'react'
import type { BattleView } from '../../../core/battleView'
import { Choice } from './CombatControls'
import { CombatSimulatorMatchup } from './CombatSimulator'
import { CombatDialog } from './RosterCombatDialog'
import { battleCombatRoster } from './battleCombatRoster'

export type BattleCombatSelection = { playerId: string; unitKey?: string }

export function BattleCombatDialog({
  view,
  selection,
  onClose,
}: {
  view: BattleView
  selection: BattleCombatSelection
  onClose: () => void
}) {
  const initialPlayer = view.players.find((player) => player.id === selection.playerId)
  const armies = view.players.flatMap((player) => {
    const roster = battleCombatRoster(player)
    return roster ? [{ player, roster }] : []
  })
  const firstArmies = armies.filter(({ player }) => player.side === initialPlayer?.side)
  const secondArmies = armies.filter(({ player }) => player.side !== initialPlayer?.side)
  const chooseArmy = firstArmies.length > 1 || secondArmies.length > 1
  const [firstId, setFirstId] = useState(selection.playerId)
  const [secondId, setSecondId] = useState(secondArmies[0]?.player.id ?? '')
  const first = firstArmies.find(({ player }) => player.id === firstId) ?? firstArmies[0]
  const second = secondArmies.find(({ player }) => player.id === secondId) ?? secondArmies[0]
  const selectedIndex = first?.roster.battle?.units.findIndex((unit) => unit.available && unit.key === selection.unitKey) ?? -1
  const roster = first ? { ...first.roster, pickIndex: selectedIndex < 0 ? first.roster.pickIndex : selectedIndex } : undefined
  return (
    <CombatDialog onClose={onClose}>
      {first && second ? (
        <CombatSimulatorMatchup
          key={JSON.stringify([first.player.id, second.player.id, first.roster, second.roster])}
          roster={roster}
          opponentRoster={second.roster}
          inDialog
          firstArmyControl={
            chooseArmy ? (
              <Choice
                label="Army"
                ariaLabel="First army"
                value={first.player.id}
                disabled={firstArmies.length === 1}
                choices={firstArmies.map(({ player }) => [player.id, player.name])}
                onChange={setFirstId}
              />
            ) : (
              <p className="text-xs text-faint">{first.player.name}</p>
            )
          }
          secondArmyControl={
            chooseArmy ? (
              <Choice
                label="Army"
                ariaLabel="Second army"
                value={second.player.id}
                disabled={secondArmies.length === 1}
                choices={secondArmies.map(({ player }) => [player.id, player.name])}
                onChange={setSecondId}
              />
            ) : (
              <p className="text-xs text-faint">{second.player.name}</p>
            )
          }
        />
      ) : (
        <p className="p-4 text-sm text-dim">Both armies need a surviving unit on the battlefield with a saved loadout.</p>
      )}
    </CombatDialog>
  )
}
