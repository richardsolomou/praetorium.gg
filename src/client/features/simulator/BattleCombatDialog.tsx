import { useState, type ComponentProps } from 'react'
import type { BattleView } from '../../../core/battleView'
import { Choice } from './CombatControls'
import { CombatSimulatorMatchup } from './CombatSimulator'
import { CombatDialog } from './RosterCombatDialog'
import { battleCombatRoster } from './battleCombatRoster'
import { RosterCombatComparison, type RosterCombatSource } from './RosterCombatComparison'

export type BattleCombatSelection = { playerId: string; unitKey?: string }
type Props = { view: BattleView; selection: BattleCombatSelection; onClose: () => void }

export function BattleCombatDialog(props: Props) {
  const [rosters, setRosters] = useState(false)
  return (
    <CombatDialog battle wide={rosters} onClose={props.onClose}>
      <BattleMatchupPlanner
        {...props}
        units={{ active: !rosters, onActiveChange: (active) => setRosters(!active), matchup: <BattleUnitCombatDialog {...props} /> }}
      />
    </CombatDialog>
  )
}

function BattleMatchupPlanner({ view, selection, units }: Props & Pick<ComponentProps<typeof RosterCombatComparison>, 'units'>) {
  const armies = view.players
    .filter((player) => player.roster?.built?.picks?.length)
    .map((player) => ({ player, roster: battleCombatRoster(player) }))
  const first = armies.find(({ player }) => player.id === selection.playerId)
  const side = (own: boolean) =>
    armies.flatMap(({ player, roster }) => (roster && (player.side === first?.player.side) === own ? [player.id] : []))
  const sources: RosterCombatSource[] = armies.map(({ player, roster }) => ({
    id: player.id,
    label: player.name,
    catalogueId: player.roster!.built!.catalogueId,
    load: async () => {
      if (!roster) throw new Error(`${player.name} has no surviving units on the battlefield.`)
      return [roster]
    },
  }))
  const liveKey = JSON.stringify(armies.map(({ player, roster }) => [player.id, player.side, roster]))
  return (
    <RosterCombatComparison
      sources={sources}
      initialAttacker={first ? side(true) : []}
      initialDefender={first ? side(false) : []}
      units={units}
      liveKey={liveKey}
      sessionKey={`battle:${view.token}:${view.viewerId}:${selection.playerId}`}
    />
  )
}

function BattleUnitCombatDialog({ view, selection }: Props) {
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
    <>
      {first && second ? (
        <CombatSimulatorMatchup
          source="battle"
          key={`${first.player.id}:${second.player.id}`}
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
    </>
  )
}
