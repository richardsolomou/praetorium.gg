import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dismissSealedEventRosterSharing, shareSealedEventRoster } from '../../functions'
import { Problem } from '../../components/Problem'
import { invalidateSavedRosters, sealedEventRosterSharingQuery } from '../../queries'

export function SealedEventRosterSharing({ token, eventToken, userId }: { token: string; eventToken: string; userId: string }) {
  const queryClient = useQueryClient()
  const query = sealedEventRosterSharingQuery(token, eventToken, userId)
  const { data, error, refetch } = useQuery(query)
  const save = useMutation({
    mutationFn: (decision: 'publish' | 'dismiss') => {
      if (!data) throw new Error('Reload the page and try again.')
      return decision === 'publish'
        ? shareSealedEventRoster({ data: { token, eventToken, submittedAt: data.submittedAt, rosterId: data.roster.id } })
        : dismissSealedEventRosterSharing({ data: { token, eventToken } })
    },
    onSuccess: async (state, decision) => {
      queryClient.setQueryData(query.queryKey, state)
      if (decision === 'publish') await invalidateSavedRosters(queryClient)
    },
    onError: () => queryClient.invalidateQueries({ queryKey: query.queryKey }),
  })
  if (!data)
    return error ? (
      <div className="mb-6">
        <Problem error={error} />
        <Button variant="ghost" size="sm" onClick={() => void refetch()}>
          Retry sharing options
        </Button>
      </div>
    ) : null
  if (!data.prompt || data.roster.visibility === 'public') return null
  return (
    <section
      data-sealed-event-sharing
      aria-label="Roster sharing"
      className="mb-6 flex flex-col gap-3 border border-info/30 border-l-2 border-l-info bg-info/5 p-4 md:flex-row md:items-center md:gap-6"
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-bone">Share your sealed roster?</h2>
          <p className="mt-1 text-sm break-words text-dim">
            Let anyone find and copy <span className="font-medium text-bone">{data.roster.name}</span> from your profile and Public Rosters.
            Your notes stay private.
          </p>
          <p className="mt-2 text-xs text-dim">
            Publishes your saved roster, including changes since sealing and future edits. You can make it private again in Rosters.
          </p>
          {save.error ? <Problem className="mt-2" error={save.error} /> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 pl-8 md:pl-0">
        <Button className="min-h-11" size="sm" disabled={save.isPending} onClick={() => save.mutate('publish')}>
          {save.isPending && save.variables === 'publish' ? 'Publishing…' : 'Make public'}
        </Button>
        <Button className="min-h-11" variant="ghost" size="sm" disabled={save.isPending} onClick={() => save.mutate('dismiss')}>
          No thanks
        </Button>
      </div>
    </section>
  )
}
