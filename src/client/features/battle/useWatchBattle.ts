import { useQuery, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { useEffect, useMemo } from 'react'
import type { BattleClock } from '../../../core/battleClock'
import type { BattleView } from '../../../core/battleView'
import { setNativeWatchBattle, useNativeBattleFollowing } from '../../nativeBridge'
import { battleQuery } from '../../queries'
import { ruleSummariesQuery } from '../../queries/references'
import { MISSION_SUMMARIES } from '../../../contracts/rules'
import type { SideMission } from '../../sides'
import type { ReferenceCard } from './MissionCards'
import { watchBattle, watchBattleTexts, type WatchReminderPrompt } from './watchBattle'
import { useRuleSummaries } from '../../ruleSummaries'
import { summaryPlainText } from '../../../shared/ruleSummaries'
import { useStableValue } from '../../useStableValue'
import { followedBattle, followBattle } from './watchFollowing'

export function useWatchBattle(
  view: BattleView,
  clock: BattleClock,
  missions: { side: number; mission: SideMission | null }[],
  referenceFor: (key: string) => ReferenceCard | undefined,
  prompts: WatchReminderPrompt[],
) {
  const queryClient = useQueryClient()
  const following = useNativeBattleFollowing()
  const available = following !== null
  const polling = available && view.status === 'playing'
  const texts = useMemo(
    () => (available ? watchBattleTexts(view, missions, referenceFor, prompts) : []),
    [available, view, missions, referenceFor, prompts],
  )
  // A watch holds no rules text, so each rule goes to it as its summary's plain text.
  const { summaryOf, pending: describingRules } = useRuleSummaries(texts)
  const { data: missionSummaries, isPending: describingMissions } = useQuery({
    ...ruleSummariesQuery(MISSION_SUMMARIES),
    enabled: available,
  })
  const describing = describingRules || (available && describingMissions)
  const described = useStableValue(
    Object.fromEntries(
      texts.flatMap((text) => {
        const summary = summaryOf(text)
        return summary ? [[text, summaryPlainText(summary)]] : []
      }),
    ),
  )
  // Query timers skip hidden pages, and 'always' refreshes on becoming visible however fresh the battle is.
  const { dataUpdatedAt } = useQuery({
    ...battleQuery(view.token),
    refetchInterval: polling ? 15_000 : false,
    refetchOnWindowFocus: polling ? 'always' : false,
    refetchOnMount: false,
  })
  useEffect(() => {
    if (!available || !(view.status === 'playing' || (view.status === 'finished' && followedBattle() === view.token))) return
    if (document.visibilityState !== 'visible' || describing) return
    const held = queryClient.getQueryData(battleQuery(view.token).queryKey)
    if (!held || held.kind === 'unavailable' || held.view.seq !== view.seq) return
    const liveUrl = `${location.origin}/api/watch/battles/${encodeURIComponent(view.token)}`
    const snapshot = watchBattle(view, clock, missions, referenceFor, prompts, dataUpdatedAt, liveUrl, (text) => {
      const mission = missionSummaries?.records[text]
      return described[text] ?? (mission ? summaryPlainText(mission) : null)
    })
    if (!snapshot) return
    if (followedBattle() !== view.token) posthog.capture('watch_battle_followed', { status: view.status, watch: following === 'watch' })
    followBattle(view.token)
    setNativeWatchBattle(snapshot)
  }, [
    view,
    clock,
    missions,
    referenceFor,
    prompts,
    queryClient,
    available,
    following,
    dataUpdatedAt,
    described,
    describing,
    missionSummaries,
  ])
}
