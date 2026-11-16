import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBattle, createSealedEventBattle, type openGroup } from '../../functions'
import { groupKey, groupLeagueKey, groupsKey } from '../../queries'
import { formatList } from '../../text'
import { useStartBattle } from '../battles/useStartBattle'

export type Group = NonNullable<Awaited<ReturnType<typeof openGroup>>>

/** Names a player by their group membership, including one who has since left. */
export const memberNameOf = (group: Pick<Group, 'members'>) => (userId: string) =>
  group.members.find((member) => member.userId === userId)?.name ?? 'A former member'

/** A complete league's outcome as a headline: who won it, or who shares first place. */
export function leagueOutcome(league: { winnerIds: readonly string[]; players: readonly { userId: string; name: string }[] }) {
  const names = formatList(league.winnerIds.map((id) => league.players.find((player) => player.userId === id)?.name ?? 'A former member'))
  if (league.winnerIds.length > 1) return `${names} share first place`
  return league.winnerIds.length ? `${names} won the league` : 'Nobody won the league'
}

export const GROUP_TABS = ['overview', 'battles', 'leaderboard', 'league'] as const
export type GroupTab = (typeof GROUP_TABS)[number]

export function useGroupRefresh(token: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupKey(token) }),
      queryClient.invalidateQueries({ queryKey: groupsKey() }),
      queryClient.invalidateQueries({ queryKey: groupLeagueKey(token) }),
    ])
}

/**
 * Starts a battle between members, counted for the group from the start and, for a league fixture, linked to it; then opens
 * it. A league that sealed lists, named by `sealedLists`, plays its fixtures with them.
 */
export function usePlayGroupGame(token: string, sealedLists: string | null = null) {
  const { defaultMissionPackId, openBattle } = useStartBattle()
  return useMutation({
    mutationFn: async ({ fixture, ...players }: { opponentIds: string[]; allyId?: string; fixture?: string }) => {
      const missionPackId = await defaultMissionPackId()
      return sealedLists && fixture
        ? createSealedEventBattle({ data: { token: sealedLists, opponentId: players.opponentIds[0]!, missionPackId, fixtureKey: fixture } })
        : createBattle({ data: { ...players, fixture, groupToken: token, missionPackId } })
    },
    onSuccess: ({ token: battleToken }) => openBattle(battleToken),
  })
}
