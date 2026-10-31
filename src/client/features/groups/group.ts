import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBattle, type openGroup } from '../../functions'
import { groupKey, groupLeagueKey, groupsKey } from '../../queries'
import { useStartBattle } from '../battles/useStartBattle'

export type Group = NonNullable<Awaited<ReturnType<typeof openGroup>>>

/** Names a player by their group membership, including one who has since left. */
export const memberNameOf = (group: Pick<Group, 'members'>) => (userId: string) =>
  group.members.find((member) => member.userId === userId)?.name ?? 'A former member'

export const GROUP_TABS = ['overview', 'leaderboard', 'league'] as const
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

/** Starts a battle between members, counted for the group from the start and, for a league fixture, linked to it; then opens it. */
export function usePlayGroupGame(token: string) {
  const { defaultMissionPackId, openBattle } = useStartBattle()
  return useMutation({
    mutationFn: async (players: { opponentIds: string[]; allyId?: string; fixture?: string }) =>
      createBattle({ data: { ...players, groupToken: token, missionPackId: await defaultMissionPackId() } }),
    onSuccess: ({ token: battleToken }) => openBattle(battleToken),
  })
}
