import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { posthog } from 'posthog-js'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { inviteToBattle, startDraft, submit } from '../../functions'
import { battleQuery, myDraftsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { advanceOnboarding } from '../onboarding/onboarding'
import { useStartBattle } from './useStartBattle'

type Start = { rosterId?: string; friendId?: string }

/**
 * Opens setup on a draft with only you at the table, reusing your untouched one. From a roster that army is already
 * chosen; from a friend, they are already invited.
 */
export function useNewBattle() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { defaultMissionPackId } = useStartBattle()
  return useMutation({
    onMutate: ({ rosterId, friendId }: Start) =>
      posthog.capture('battle_creation_started', rosterId ? { source: 'roster' } : friendId ? { source: 'friend' } : {}),
    mutationFn: async ({ rosterId, friendId }: Start) => {
      const draft = await startDraft({ data: { missionPackId: await defaultMissionPackId() } })
      // Setup still offers both, so either failing here is only a step left to do there.
      if (rosterId) {
        const screen = await queryClient.query(battleQuery(draft.token))
        if (screen?.kind === 'battle')
          await submit({
            data: { token: draft.token, expectedSeq: screen.view.seq, command: { kind: 'attach-saved-roster', rosterId } },
          }).catch(() => posthog.capture('battle_roster_attach_failed', { reason: 'error' }))
      }
      if (friendId) await inviteToBattle({ data: { token: draft.token, friendId } }).catch(() => null)
      return draft
    },
    onError: (error) => {
      posthog.capture('battle_creation_failed', { reason: 'request' })
      toast.error(errorMessage(error))
    },
    onSuccess: async ({ token }) => {
      void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
      void queryClient.invalidateQueries({ queryKey: myDraftsQuery().queryKey })
      await navigate({ to: '/battles/$token', params: { token } })
    },
  })
}

export function NewBattle() {
  const start = useNewBattle()
  return (
    <Button
      data-onboarding="create-battle"
      disabled={start.isPending}
      onClick={() => {
        advanceOnboarding('battle', 'battle-start', 'battle-setup-size')
        start.mutate({})
      }}
    >
      <Plus /> New battle
    </Button>
  )
}
