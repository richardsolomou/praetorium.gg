import { useQueryClient } from '@tanstack/react-query'
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
  useEffect(() => {
    const live = view.status === 'playing'
    if (!available || !(live || (view.status === 'finished' && following === view.token))) return
    let current = true
    const queryKey = battleQuery(view.token).queryKey
    const publish = () => {
      const held = queryClient.getQueryData(queryKey)
      if (!current || document.visibilityState !== 'visible' || !held || held.kind === 'unavailable' || held.view.seq !== view.seq) return
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0
      const liveUrl = `${location.origin}/api/watch/battles/${encodeURIComponent(view.token)}`
      const snapshot = watchBattle(view, clock, missions, referenceFor, prompts, updatedAt, liveUrl)
      if (!snapshot) return
      following = view.token
      setNativeWatchBattle(snapshot)
    }
    publish()
    if (!live)
      return () => {
        current = false
      }
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void queryClient.refetchQueries({ queryKey, exact: true, type: 'active' }).then(publish)
    }
    const timer = window.setInterval(refresh, 15_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      current = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [view, clock, missions, referenceFor, prompts, queryClient, available])
}
