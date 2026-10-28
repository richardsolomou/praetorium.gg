import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BattleUnavailable } from './BattleUnavailable'
import { FullPageState } from '../../components/PageState'
import { Setup } from './setup/Setup'
import { Spectator } from './Spectator'
import { Tracker } from './Tracker'
import { GuestKeepGame } from './GuestKeepGame'
import { isGuestSeat } from '../../../core/newBattle'
import { celebrateVictory } from './victory'
import { battleResult } from '../../battleOutcome'
import { sides } from '../../sides'
import { battleQuery, battlesQuery } from '../../queries'
import { confirmedSeq, useCommand } from './useCommand'
import { useSpacetimeLiveBattle } from '../../spacetimeLive'
import { setNativeBattleActive } from '../../nativeBridge'
import { warmLocalConstruction } from '../../offline/construction'
import type { openBattle } from '../../functions'

export function BattlePage({ token }: { token: string }) {
  const { data: screen, isPending } = useQuery(battleQuery(token))
  const queryClient = useQueryClient()
  const gone = !isPending && !screen
  // A battle deleted elsewhere is still in the cached list this page hands over to.
  useEffect(() => {
    if (gone) void queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
  }, [gone, queryClient])

  if (isPending) return <FullPageState loading title="Loading battle" explanation="Opening the battle history." />
  if (!screen) return <Navigate to="/battles" replace />
  if (screen.kind === 'unavailable') return <BattleUnavailable />
  if (screen.kind === 'spectator')
    return (
      <Spectator view={screen.view} clock={screen.clock} missions={screen.missions} report={screen.report} timeline={screen.timeline} />
    )
  return <SeatedBattle token={token} screen={screen} />
}

function SeatedBattle({ token, screen }: { token: string; screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'battle' }> }) {
  useSpacetimeLiveBattle(token, true)
  // Taps are shown from the rules on this device, which take a moment to prepare.
  useEffect(() => warmLocalConstruction(), [])
  useEffect(() => {
    setNativeBattleActive(true)
    return () => {
      setNativeBattleActive(false)
    }
  }, [])
  const { send, attachRoster, problem, pending } = useCommand(token, confirmedSeq(screen))
  const status = screen.view.status
  const previousStatus = useRef(status)
  // Setup and the tracker share a URL, so the scroll that reached Start battle would carry into the first turn.
  useLayoutEffect(() => {
    if (previousStatus.current === 'setup' && status !== 'setup') window.scrollTo(0, 0)
    previousStatus.current = status
  }, [status])
  if (screen.view.status === 'finished') return <FinishedBattle screen={screen} />
  if (screen.view.status === 'setup')
    return (
      <Setup
        view={screen.view}
        mission={screen.mission}
        missions={screen.missions}
        send={send}
        attachRoster={attachRoster}
        pending={pending}
        problem={problem}
      />
    )
  return <Tracker view={screen.view} clock={screen.clock} missions={screen.missions} send={send} pending={pending} problem={problem} />
}

function FinishedBattle({ screen }: { screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'battle' }> }) {
  const { view, clock, missions } = screen
  // Kept here, so the thanks outlasts the refetch that seats the account where the guest sat.
  const [claimed, setClaimed] = useState(false)
  const won = useMemo(() => {
    const table = sides(view, missions)
    const result = battleResult(table, view)
    const side = result.kind === 'win' ? table.find((entry) => entry.index === result.side.index) : undefined
    return side?.isViewer ? side.index : null
  }, [missions, view])
  useEffect(() => {
    if (won !== null) void celebrateVictory(view.token, won)
  }, [view.token, won])
  return (
    <Spectator
      view={view}
      clock={clock}
      missions={missions}
      timeline={screen.timeline}
      lead={
        isGuestSeat(view.viewerId) || claimed ? <GuestKeepGame view={view} claimed={claimed} onClaimed={() => setClaimed(true)} /> : null
      }
    />
  )
}
