import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Problem } from '../../components/Problem'
import { declineRosterSharing, setRosterVisibility } from '../../functions'
import { invalidateSavedRosters, savedRosterSummariesQuery } from '../../queries'

/** The one way every screen asks a player to make a saved roster public. */
export function RosterSharingCard({
  name,
  note,
  pending,
  error,
  onPublish,
  onDecline,
}: {
  name: string
  /** A line on what exactly gets shared, where that can differ from what the screen shows. */
  note?: ReactNode
  pending: 'publish' | 'decline' | null
  error: unknown
  onPublish: () => void
  onDecline: () => void
}) {
  return (
    <section
      data-roster-sharing
      aria-label="Roster sharing"
      className="flex flex-col gap-3 part border-info/40 p-4 md:flex-row md:items-center md:gap-6"
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Globe className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-base font-semibold break-words text-bone">Share {name}?</h2>
          <p className="mt-1 text-sm break-words text-dim">
            Make it public so other players can find it, copy it and test their lists against it. Your notes stay private, and you can
            change this any time in Rosters.
          </p>
          {note ? <p className="mt-2 text-xs text-dim">{note}</p> : null}
          {error ? <Problem className="mt-2" error={error} /> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 pl-8 md:pl-0">
        <Button className="min-h-11" size="sm" disabled={pending !== null} onClick={onPublish}>
          {pending === 'publish' ? 'Publishing…' : 'Make public'}
        </Button>
        <Button className="min-h-11" variant="ghost" size="sm" disabled={pending !== null} onClick={onDecline}>
          No thanks
        </Button>
      </div>
    </section>
  )
}

/** Asks the reader to make one of their saved rosters public, unless it already is or they said No thanks to it. */
export function RosterSharingPrompt({ rosterId }: { rosterId: string }) {
  const queryClient = useQueryClient()
  const roster = useQuery({ ...savedRosterSummariesQuery(), select: (rosters) => rosters.find(({ id }) => id === rosterId) }).data
  const answer = useMutation({
    mutationFn: (decision: 'publish' | 'decline') =>
      decision === 'publish'
        ? setRosterVisibility({ data: { id: rosterId, visibility: 'public' } })
        : declineRosterSharing({ data: { id: rosterId } }),
    onSuccess: () => invalidateSavedRosters(queryClient),
  })
  // Answered, it stays hidden while the library refreshes behind it.
  if (!roster || roster.visibility === 'public' || roster.sharingDeclined || answer.isSuccess) return null
  return (
    <RosterSharingCard
      name={roster.name}
      pending={answer.isPending ? answer.variables : null}
      error={answer.error}
      onPublish={() => answer.mutate('publish')}
      onDecline={() => answer.mutate('decline')}
    />
  )
}
