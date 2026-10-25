import { useQueryClient } from '@tanstack/react-query'
import type { openClub } from '../../functions'
import { clubKey, clubsKey } from '../../queries'

export type Club = NonNullable<Awaited<ReturnType<typeof openClub>>>

export function useClubRefresh(token: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: clubKey(token) }), queryClient.invalidateQueries({ queryKey: clubsKey() })])
}
