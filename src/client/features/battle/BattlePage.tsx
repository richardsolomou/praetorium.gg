import { useQuery } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { BattleUnavailable } from './BattleUnavailable'
import { Setup } from './setup/Setup'
import { Spectator } from './Spectator'
import { Tracker } from './Tracker'
import { battleQuery } from '../../queries'
import { useCommand } from './useCommand'
import { useLiveBattle } from '../../useLiveBattle'
import { setNativeBattleActive } from '../../nativeBridge'
import type { openBattle } from '../../../server/functions'

export function BattlePage({ token }: { token: string }) {
  const { data: screen } = useQuery(battleQuery(token))

  if (!screen) return <Navigate to="/battles" replace />
  if (screen.kind === 'unavailable') return <BattleUnavailable token={token} />
  if (screen.kind === 'spectator') return <Spectator view={screen.view} missions={screen.missions} report={screen.report} />
  return <SeatedBattle token={token} screen={screen} />
}

function SeatedBattle({ token, screen }: { token: string; screen: Extract<Awaited<ReturnType<typeof openBattle>>, { kind: 'battle' }> }) {
  useLiveBattle(token, true)
  useEffect(() => {
    setNativeBattleActive(true)
    return () => {
      setNativeBattleActive(false)
    }
  }, [])
  const { send, attachSavedRoster, problem, pending } = useCommand(token, screen.view.seq)
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
  return <Tracker view={screen.view} missions={screen.missions} send={send} pending={pending} problem={problem} />
}
