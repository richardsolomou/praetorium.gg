import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { FullPageState, PageLoading } from '../../components/PageState'
import { Setup } from './setup/Setup'
import { Spectator } from './Spectator'
import { Tracker } from './Tracker'
import { AfterBattle } from './AfterBattle'
import { PracticeNextGame } from './PracticeNextGame'
import { isPracticeSeat } from '../../../core/newBattle'
import { celebrateVictory } from './victory'
import { battleResult } from '../../battleOutcome'
import { sides } from '../../sides'
import { PaintedBattle } from './battleColours'
import { battleQuery, battlesQuery } from '../../queries'
import { confirmedSeq, useCommand } from './useCommand'
import { useSpacetimeLiveBattle } from '../../spacetimeLive'
import { setNativeBattleActive } from '../../nativeBridge'
import { warmLocalRules } from '../../offline/construction'
import type { openBattle } from '../../functions'

export function BattlePage({ token }: { token: string }) {
  const { data: screen, isPending } = useQuery(battleQuery(token))
  const queryClient = useQueryClient()
  const gone = !isPending && !screen
  // A battle deleted elsewhere is still in the cached list this page hands over to.
  useEffect(() => {
    if (gone) void queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
  }, [gone, queryClient])

  if (isPending) return <PageLoading />
  if (!screen) return <Navigate to="/battles" replace />
  if (screen.kind === 'unavailable')
    return <FullPageState title="This battle is not open" explanation="Nobody is seated at this battle, so there is nothing to watch." />
  return (
    <PaintedBattle players={screen.view.players}>
      {screen.kind === 'spectator' ? <WatchedBattle token={token} screen={screen} /> : <SeatedBattle token={token} screen={screen} />}
    </PaintedBattle>
  )
}

function WatchedBattle({
  token,
  screen,
}: {
  token: string
  screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'spectator' }>
}) {
  useSpacetimeLiveBattle(token)
  // Until it begins there is no score or turn to follow, only the table's answers.
  if (screen.view.status === 'setup')
    return <Setup view={screen.view} mission={screen.missions.find((entry) => entry.mission)?.mission ?? null} missions={screen.missions} />
  return <Spectator view={screen.view} clock={screen.clock} missions={screen.missions} report={screen.report} timeline={screen.timeline} />
}

function SeatedBattle({ token, screen }: { token: string; screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'battle' }> }) {
  useSpacetimeLiveBattle(token)
  // Taps are shown from the rules on this device, which take a moment to prepare.
  useEffect(() => warmLocalRules(), [])
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

/** A seated player's game against nobody but practice opponents. */
const practicedAlone = ({ players, viewerId }: { players: readonly { id: string; automated: boolean }[]; viewerId: string | null }) =>
  players.some(({ id }) => id === viewerId) && players.filter(({ id }) => id !== viewerId).every(isPracticeSeat)

function FinishedBattle({ screen }: { screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'battle' }> }) {
  const { view, clock, missions } = screen
  const won = useMemo(() => {
    const table = sides(view, missions)
    const result = battleResult(table, view)
    return result.kind === 'win' && result.side.isViewer ? result.side.index : null
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
      lead={practicedAlone(view) ? <PracticeNextGame /> : <AfterBattle view={view} />}
    />
  )
}
