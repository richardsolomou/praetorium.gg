import { useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import type { BattleClock } from '../../../core/battleClock'
import type { BattleView } from '../../../core/battleView'
import { setNativeWatchBattle, useNativeWatchBattleAvailability } from '../../nativeBridge'
import { battleQuery } from '../../queries'
import type { SideMission } from '../../sides'
import type { ReferenceCard } from './MissionCards'
import { watchBattle, type WatchReminderPrompt } from './watchBattle'
import { followedBattle, followBattle } from './watchFollowing'

export function useWatchBattle(
  view: BattleView,
  clock: BattleClock,
  missions: { side: number; mission: SideMission | null }[],
  referenceFor: (key: string) => ReferenceCard | undefined,
  prompts: WatchReminderPrompt[],
) {
  const queryClient = useQueryClient()
  const available = useNativeWatchBattleAvailability()
  const polling = available && view.status === 'playing'
  // Query timers skip hidden pages, and 'always' refreshes on becoming visible however fresh the battle is.
  const { dataUpdatedAt } = useQuery({
    ...battleQuery(view.token),
    refetchInterval: polling ? 15_000 : false,
    refetchOnWindowFocus: polling ? 'always' : false,
    refetchOnMount: false,
  })
  useEffect(() => {
    if (!available || !(view.status === 'playing' || (view.status === 'finished' && followedBattle() === view.token))) return
    if (document.visibilityState !== 'visible') return
    const held = queryClient.getQueryData(battleQuery(view.token).queryKey)
    if (!held || held.kind === 'unavailable' || held.view.seq !== view.seq) return
    const liveUrl = `${location.origin}/api/watch/battles/${encodeURIComponent(view.token)}`
    const snapshot = watchBattle(view, clock, missions, referenceFor, prompts, dataUpdatedAt, liveUrl)
    if (!snapshot) return
    if (followedBattle() !== view.token) posthog.capture('watch_battle_followed', { status: view.status })
    followBattle(view.token)
    setNativeWatchBattle(snapshot)
  }, [view, clock, missions, referenceFor, prompts, queryClient, available, dataUpdatedAt])
}
