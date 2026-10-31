import type { QueryClient } from '@tanstack/react-query'
import { armySlugs } from './HomeArmyUpdates'
import { playerProfile, playerRankings } from '../../functions'
import {
  armyUpdatesQuery,
  battlesQuery,
  deploymentsQuery,
  factionIndexQuery,
  friendBattlesQuery,
  friendshipsQuery,
  homeRostersQuery,
  sealedEventsQuery,
  meQuery,
  onboardingQuery,
  playerProfileQuery,
  playerRankingsQuery,
  publicBattlesQuery,
  standingsQuery,
} from '../../queries'
import { warnIfSlow } from '../shell/slowLoader'

/** How long the loader waits, from its start, for the player's record before leaving it to the client. */
const RECORD_BUDGET_MS = 300

/** Fetches the home feeds so the first frame has its final layout. */
export async function loadHome(queryClient: QueryClient) {
  const startedAt = performance.now()
  const durations: Record<string, number> = {}
  const timed = async <T>(name: string, work: Promise<T>) => {
    const started = performance.now()
    try {
      return await work
    } finally {
      durations[name] = Math.round(performance.now() - started)
    }
  }
  // The record folds every battle the player has played, so it joins the first frame only within a budget and
  // otherwise loads on the client. Left pending in the cache, it would hold the streamed page, and its hydration,
  // open until it settled.
  let record: Promise<(() => void) | undefined> | undefined
  await Promise.all([
    timed('publicBattles', queryClient.infiniteQuery({ ...publicBattlesQuery(), staleTime: 'static' })),
    // Battle rows name their battlefield from it; without it the rows can only add it after hydration.
    timed(
      'deployments',
      queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ),
    timed('me', queryClient.query({ ...meQuery(), staleTime: 'static' })).then((me): Promise<unknown> => {
      if (!me) return timed('standings', queryClient.query({ ...standingsQuery(), staleTime: 'static' }))
      record = Promise.all([playerProfile({ data: { userId: me.id } }), playerRankings({ data: { userId: me.id } })]).then(
        ([profile, rankings]) =>
          () => {
            queryClient.setQueryData(playerProfileQuery(me.id).queryKey, profile)
            queryClient.setQueryData(playerRankingsQuery(me.id).queryKey, rankings)
          },
        () => undefined,
      )
      const rosters = timed('homeRosters', queryClient.query({ ...homeRostersQuery(), staleTime: 'static' }))
      const factions = timed('factionIndex', queryClient.query({ ...factionIndexQuery(), staleTime: 'static' }))
      return Promise.all([
        timed('myBattles', queryClient.infiniteQuery({ ...battlesQuery(), staleTime: 'static' })),
        timed('friendBattles', queryClient.infiniteQuery({ ...friendBattlesQuery(), staleTime: 'static' })),
        Promise.all([rosters, factions]).then(([home, index]) => {
          const armies = armySlugs(home.rosters.map(({ roster }) => index?.factions.find((faction) => faction.id === roster.catalogueId)))
          // A side panel the page reads fine without; the client asks again rather than the page failing.
          return armies.length
            ? timed(
                'armyUpdates',
                queryClient.query({ ...armyUpdatesQuery(armies), staleTime: 'static' }).catch(() => null),
              )
            : null
        }),
        timed('sealedEvents', queryClient.query({ ...sealedEventsQuery(), staleTime: 'static' })),
        timed('friendships', queryClient.query({ ...friendshipsQuery(), staleTime: 'static' })),
        timed(
          'onboarding',
          queryClient.query({ ...onboardingQuery(), staleTime: 'static' }).catch(() => null),
        ),
      ])
    }),
  ])
  if (record) {
    const late = new Promise<undefined>((resolve) => setTimeout(resolve, startedAt + RECORD_BUDGET_MS - performance.now()))
    const fill = await Promise.race([record, late])
    fill?.()
  }
  warnIfSlow('slow_home_loader', startedAt, { queries_ms: durations })
}
