import type { QueryClient } from '@tanstack/react-query'
import { playerProfile, playerRankings, savedRosterChangedIds } from '../../functions'
import {
  battlesQuery,
  deploymentsQuery,
  friendBattlesQuery,
  friendshipsQuery,
  groupsQuery,
  homeGroupsQuery,
  homeRostersQuery,
  sealedEventsQuery,
  meQuery,
  onboardingQuery,
  playerProfileQuery,
  playerRankingsQuery,
  publicBattlesQuery,
  savedRosterChangedIdsQuery,
  standingsQuery,
} from '../../queries'
import { warnIfSlow } from '../shell/slowLoader'
import { byLatestGame, HOME_GROUPS_SHOWN } from '../../../core/group'
import type { QueryData } from '../../queries'

type GroupRow = QueryData<typeof groupsQuery>[number]

/** The groups the player belongs to or asked to join: the ones played in most recently first, a request still waiting last. */
export function homeMemberships(groups: readonly GroupRow[]) {
  return groups
    .filter(({ ownMember }) => ownMember)
    .toSorted(
      (one, other) =>
        Number(one.ownMember?.status === 'pending') - Number(other.ownMember?.status === 'pending') || byLatestGame(one, other),
    )
}

/** The groups whose place and league game home sums up, which the loader and the page must name alike to share the read. */
export function summarisedGroups(memberships: readonly GroupRow[]) {
  return memberships
    .filter(({ ownMember }) => ownMember?.status === 'accepted')
    .slice(0, HOME_GROUPS_SHOWN)
    .map(({ token }) => token)
}

/** How long the loader waits, from its start, for the record and the changed lists before leaving them to the client. */
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
  // The record folds every battle the player has played, and the changed lists compare every list with the data
  // history, so each joins the first frame only within a budget and otherwise loads on the client. Left pending in the
  // cache, either would hold the streamed page, and its hydration, open until it settled.
  const budgeted: Promise<(() => void) | undefined>[] = []
  const withinBudget = <T>(work: Promise<T>, fill: (value: T) => void) =>
    budgeted.push(
      work.then(
        (value) => () => fill(value),
        () => undefined,
      ),
    )
  await Promise.all([
    timed('publicBattles', queryClient.infiniteQuery({ ...publicBattlesQuery(), staleTime: 'static' })),
    // Battle rows name their battlefield from it; without it the rows can only add it after hydration.
    timed(
      'deployments',
      queryClient.query({ ...deploymentsQuery(), staleTime: 'static' }).catch(() => null),
    ),
    timed('me', queryClient.query({ ...meQuery(), staleTime: 'static' })).then((me): Promise<unknown> => {
      if (!me) return timed('standings', queryClient.query({ ...standingsQuery(), staleTime: 'static' }))
      withinBudget(
        Promise.all([playerProfile({ data: { userId: me.id } }), playerRankings({ data: { userId: me.id } })]),
        ([profile, rankings]) => {
          queryClient.setQueryData(playerProfileQuery(me.id).queryKey, profile)
          queryClient.setQueryData(playerRankingsQuery(me.id).queryKey, rankings)
        },
      )
      return Promise.all([
        timed('myBattles', queryClient.infiniteQuery({ ...battlesQuery(), staleTime: 'static' })),
        timed('friendBattles', queryClient.infiniteQuery({ ...friendBattlesQuery(), staleTime: 'static' })),
        timed('homeRosters', queryClient.query({ ...homeRostersQuery(), staleTime: 'static' })).then((home) => {
          if (!home.count) return
          withinBudget(savedRosterChangedIds(), (ids) => queryClient.setQueryData(savedRosterChangedIdsQuery().queryKey, ids))
        }),
        timed('sealedEvents', queryClient.query({ ...sealedEventsQuery(), staleTime: 'static' })),
        timed('friendships', queryClient.query({ ...friendshipsQuery(), staleTime: 'static' })),
        timed('groups', queryClient.query({ ...groupsQuery(), staleTime: 'static' })).then((groups) => {
          const tokens = summarisedGroups(homeMemberships(groups))
          // The groups panel reads fine without places, so a failure leaves them to the client rather than failing the page.
          return tokens.length
            ? timed(
                'homeGroups',
                queryClient.query({ ...homeGroupsQuery(tokens), staleTime: 'static' }).catch(() => null),
              )
            : null
        }),
        timed(
          'onboarding',
          queryClient.query({ ...onboardingQuery(), staleTime: 'static' }).catch(() => null),
        ),
      ])
    }),
  ])
  const late = new Promise<void>((resolve) => setTimeout(resolve, startedAt + RECORD_BUDGET_MS - performance.now()))
  await Promise.all(budgeted.map((work) => Promise.race([work, late]).then((fill) => fill?.())))
  warnIfSlow('slow_home_loader', startedAt, { queries_ms: durations })
}
