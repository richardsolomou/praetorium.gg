import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { dismissSealedEventRosterSharing, shareSealedEventRoster } from '../../functions'
import { Problem } from '../../components/Problem'
import { invalidateSavedRosters, sealedEventRosterSharingQuery } from '../../queries'
import { RosterSharingCard } from '../rosters/RosterSharingPrompt'

/** Asks a player whose sealed list is revealed to make the saved roster behind it public. */
export function SealedEventRosterSharing({
  token,
  eventToken,
  userId,
  className,
}: {
  token: string
  eventToken: string
  userId: string
  className?: string
}) {
  const queryClient = useQueryClient()
  const query = sealedEventRosterSharingQuery(token, eventToken, userId)
  const { data, error, refetch } = useQuery(query)
  const save = useMutation({
    mutationFn: (decision: 'publish' | 'decline') => {
      if (!data) throw new Error('Reload the page and try again.')
      return decision === 'publish'
        ? shareSealedEventRoster({ data: { token, eventToken, submittedAt: data.submittedAt, rosterId: data.roster.id } })
        : dismissSealedEventRosterSharing({ data: { token, eventToken } })
    },
    // Either answer is kept on the roster, so every other screen that would ask about it reads the library again.
    onSuccess: async (state) => {
      queryClient.setQueryData(query.queryKey, state)
      await invalidateSavedRosters(queryClient)
    },
    onError: () => queryClient.invalidateQueries({ queryKey: query.queryKey }),
  })
  if (!data)
    return error ? (
      <div className={className}>
        <Problem error={error} />
        <Button variant="ghost" size="sm" onClick={() => void refetch()}>
          Retry sharing options
        </Button>
      </div>
    ) : null
  if (!data.prompt || data.roster.visibility === 'public') return null
  return (
    <div className={className}>
      <RosterSharingCard
        name={data.roster.name}
        note="This shares your saved roster as it is now, including any changes since you sealed it."
        pending={save.isPending ? save.variables : null}
        error={save.error}
        onPublish={() => save.mutate('publish')}
        onDecline={() => save.mutate('decline')}
      />
    </div>
  )
}
