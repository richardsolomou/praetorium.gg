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

/**
 * The battle on the watch. It stays there after its page closes, since the watch polls it, until
 * another battle replaces it or the account signs out; a finished battle only replaces itself.
 */
let following: string | null = null

/** Takes the watch off whatever battle it follows, along with the seated player's objectives and reminders. */
export function clearWatchBattle() {
  following = null
  setNativeWatchBattle(null)
}

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
    if (!available || !(view.status === 'playing' || (view.status === 'finished' && following === view.token))) return
    if (document.visibilityState !== 'visible') return
    const held = queryClient.getQueryData(battleQuery(view.token).queryKey)
    if (!held || held.kind === 'unavailable' || held.view.seq !== view.seq) return
    const liveUrl = `${location.origin}/api/watch/battles/${encodeURIComponent(view.token)}`
    const snapshot = watchBattle(view, clock, missions, referenceFor, prompts, dataUpdatedAt, liveUrl)
    if (!snapshot) return
    if (following !== view.token) posthog.capture('watch_battle_followed', { status: view.status })
    following = view.token
    setNativeWatchBattle(snapshot)
  }, [view, clock, missions, referenceFor, prompts, queryClient, available, dataUpdatedAt])
}
