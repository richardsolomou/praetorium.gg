import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { submit } from '../../functions'
import { isFetchNetworkFailure } from '../../networkErrors'
import { battleQuery, battlesQuery, gameReferencesQuery } from '../../queries'

/** What every way of starting a battle shares: the mission pack it plays by default, the creator's first army, and opening it once created. */
export function useStartBattle() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return {
    /** The pack asked for while it is still offered, otherwise the first one. */
    defaultMissionPackId: async (preferred?: string | null) => {
      const packs = (await queryClient.query({ ...gameReferencesQuery(), staleTime: 'static' }))?.packs ?? []
      return (packs.find((pack) => pack.id === preferred) ?? packs[0])?.id ?? null
    },
    /** Setup still offers the choice of army, so a list the battle refuses here is only a step left to do there. */
    bringRoster: async (token: string, rosterId: string) => {
      try {
        const screen = await queryClient.query(battleQuery(token))
        if (screen?.kind !== 'battle') return
        const command = { kind: 'attach-saved-roster' as const, rosterId }
        const attached = await submit({ data: { token, expectedSeq: screen.view.seq, command } })
        queryClient.setQueryData(battleQuery(token).queryKey, attached.screen)
      } catch (error) {
        // The battle exists either way, and its setup shows the seat without an army.
        posthog.capture('battle_roster_attach_failed', { reason: isFetchNetworkFailure(error) ? 'network' : 'error' })
      }
    },
    openBattle: async (token: string) => {
      // The new battle's page does not show the list, so it opens without waiting for the refetch.
      void queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token } })
    },
  }
}
