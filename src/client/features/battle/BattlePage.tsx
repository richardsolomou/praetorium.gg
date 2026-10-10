import { useQuery } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { BattleUnavailable } from './BattleUnavailable'
import { Setup } from './setup/Setup'
import { Spectator } from './Spectator'
import { Tracker } from './Tracker'
import { celebrateVictory } from './victory'
import { battleResult } from '../../battleOutcome'
import { sides } from '../../sides'
import { battleQuery } from '../../queries'
import { useCommand } from './useCommand'
import { useSpacetimeLiveBattle } from '../../spacetimeLive'
import { setNativeBattleActive } from '../../nativeBridge'
import type { openBattle } from '../../functions'

export function BattlePage({ token }: { token: string }) {
  const { data: screen } = useQuery(battleQuery(token))

  if (!screen) return <Navigate to="/battles" replace />
  if (screen.kind === 'unavailable') return <BattleUnavailable token={token} />
  if (screen.kind === 'spectator')
    return (
      <Spectator view={screen.view} clock={screen.clock} missions={screen.missions} report={screen.report} timeline={screen.timeline} />
    )
  return <SeatedBattle token={token} screen={screen} />
}

function SeatedBattle({ token, screen }: { token: string; screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'battle' }> }) {
  useSpacetimeLiveBattle(token, true)
  useEffect(() => {
    setNativeBattleActive(true)
    return () => {
      setNativeBattleActive(false)
    }
  }, [])
  const { send, attachSavedRoster, problem, pending } = useCommand(token, screen.view.seq)
  if (screen.view.status === 'finished') return <FinishedBattle screen={screen} />
  if (screen.view.status === 'setup')
    return (
      <Setup
        view={screen.view}
        mission={screen.mission}
        missions={screen.missions}
        send={send}
        attachSavedRoster={attachSavedRoster}
        pending={pending}
        problem={problem}
      />
    )
  return <Tracker view={screen.view} clock={screen.clock} missions={screen.missions} send={send} pending={pending} problem={problem} />
}

function FinishedBattle({ screen }: { screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'battle' }> }) {
  const { view, clock, missions } = screen
  const won = useMemo(() => {
    const table = sides(view, missions)
    const result = battleResult(table, view)
    const side = result.kind === 'win' ? table.find((entry) => entry.index === result.side.index) : undefined
    return side?.isViewer ? side.index : null
  }, [missions, view])
  useEffect(() => {
    if (won !== null) void celebrateVictory(view.token, won)
  }, [view.token, won])
  return <Spectator view={view} clock={clock} missions={missions} timeline={screen.timeline} />
}
