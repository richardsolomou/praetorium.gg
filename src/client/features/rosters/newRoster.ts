import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { saveRoster } from '../../functions'
import { invalidateSavedRosters, meQuery } from '../../queries'
import { newGuestDraft, writeGuestDraft } from './guestDraft'
import type { RosterSetup } from './RosterSetupDialog'

/** The reference page a roster was started from, as telemetry names it. */
export type RosterReference = 'datasheet' | 'detachment'

/**
 * Starting a roster from a setup and opening it in the builder, with `add` asked of it there.
 *
 * A player's list is saved first; a visitor's is kept in this tab, as the builder keeps
 * it. Should the tab refuse to keep it, the builder's own setup opens instead and the
 * requested unit still waits for the list started there.
 */
export function useNewRoster(reference?: RosterReference) {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const from = reference ? { reference } : {}
  const create = useMutation({
    onMutate: () => posthog.capture('roster_creation_submitted', from),
    onError: () => posthog.capture('roster_creation_failed', { reason: 'request', ...from }),
    mutationFn: ({ setup }: { setup: RosterSetup; add?: string }) =>
      saveRoster({ data: { ...setup, picks: [], prep: null, source: 'editable' } }),
    onSuccess: async ({ id }, { add }) => {
      await invalidateSavedRosters(queryClient)
      await navigate({ to: '/rosters/$id', params: { id }, search: add ? { add } : {} })
    },
  })
  const start = (setup: RosterSetup, add?: string) => {
    if (me) return create.mutate({ setup, add })
    writeGuestDraft(newGuestDraft(setup))
    posthog.capture('guest_roster_started', { limit: setup.limit, detachment_count: setup.detachmentIds.length, ...from })
    void navigate({ to: '/rosters', search: add ? { add } : {} })
  }
  return { start, pending: create.isPending, failed: create.isError, guest: !me }
}
