import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { battlesQuery, gameReferencesQuery } from '../../queries'

/** What every way of starting a battle shares: the mission pack it plays by default, and opening it once created. */
export function useStartBattle() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return {
    defaultMissionPackId: async () => (await queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' }))?.packs[0]?.id ?? null,
    openBattle: async (token: string) => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token } })
    },
  }
}
