import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBattle, type openClub } from '../../functions'
import { clubKey, clubSeasonKey, clubsKey } from '../../queries'
import { useStartBattle } from '../battles/useStartBattle'

export type Club = NonNullable<Awaited<ReturnType<typeof openClub>>>

export function useClubRefresh(token: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: clubKey(token) }),
      queryClient.invalidateQueries({ queryKey: clubsKey() }),
      queryClient.invalidateQueries({ queryKey: clubSeasonKey(token) }),
    ])
}

/** Starts a battle against a member, counted for the club from the start and, for a season fixture, linked to it; then opens it. */
export function usePlayClubGame(token: string) {
  const { defaultMissionPackId, openBattle } = useStartBattle()
  return useMutation({
    mutationFn: async ({ opponentId, fixture }: { opponentId: string; fixture?: string }) =>
      createBattle({ data: { opponentId, clubToken: token, fixture, missionPackId: await defaultMissionPackId() } }),
    onSuccess: ({ token: battleToken }) => openBattle(battleToken),
  })
}
