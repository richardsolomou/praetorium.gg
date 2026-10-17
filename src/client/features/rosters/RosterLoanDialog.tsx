import { useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { endRosterLoan, lendRoster } from '../../functions'
import { friendshipsQuery, rosterLoansQuery, rostersLentToMeQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { Problem } from '../../components/Problem'

/** The owner chooses which friends may view a roster and field it in their own battles. */
export function RosterLoanDialog({ rosterId, open, onClose }: { rosterId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const friends = useQuery({ ...friendshipsQuery(), enabled: open })
  const loans = useQuery({ ...rosterLoansQuery(rosterId), enabled: open })
  const [problem, setProblem] = useState<string | null>(null)
  const lent = new Set(loans.data?.map((loan) => loan.borrowerId))
  const change = useMutation({
    mutationFn: ({ borrowerId, lend }: { borrowerId: string; lend: boolean }) =>
      (lend ? lendRoster : endRosterLoan)({ data: { id: rosterId, borrowerId } }),
    onMutate: () => setProblem(null),
    onError: (error) => setProblem(errorMessage(error, 'Could not change who can borrow this roster. Try again.')),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: rosterLoansQuery(rosterId).queryKey }),
        queryClient.invalidateQueries({ queryKey: rostersLentToMeQuery().queryKey }),
      ]),
  })
  const listed = friends.data?.friends ?? []

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lend to a friend</DialogTitle>
          <DialogDescription>
            A friend can view this roster and field it in their battles, but not edit it. Your unit notes and battle preparation stay yours.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {friends.isPending || loans.isPending ? (
            <ul aria-label="Loading friends" aria-busy="true" className="grid gap-2">
              {[0, 1, 2].map((key) => (
                <li key={key} className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </li>
              ))}
            </ul>
          ) : friends.isError || loans.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load your friends. Try again.
            </p>
          ) : listed.length === 0 ? (
            <p className="text-sm text-dim">
              You can lend a roster only to a friend.{' '}
              <Link to="/friends" className="underline">
                Add friends
              </Link>
            </p>
          ) : (
            <ul className="grid gap-2" data-roster-loans>
              {listed.map((friend) => (
                <LoanRow
                  key={friend.id}
                  friend={friend}
                  lent={lent.has(friend.id)}
                  pending={change.isPending && change.variables.borrowerId === friend.id}
                  onChange={(lend) => change.mutate({ borrowerId: friend.id, lend })}
                />
              ))}
            </ul>
          )}
          {problem ? <Problem>{problem}</Problem> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function LoanRow({
  friend,
  lent,
  pending,
  onChange,
}: {
  friend: { id: string; name: string; image: string | null }
  lent: boolean
  pending: boolean
  onChange: (lend: boolean) => void
}) {
  const switchId = useId()
  return (
    <li>
      <label htmlFor={switchId} className="flex items-center gap-3">
        <PlayerAvatar name={friend.name} image={friend.image} className="size-9 text-xs" />
        <span className="min-w-0 flex-1 truncate font-bold uppercase">{friend.name}</span>
        <Switch id={switchId} aria-label={`Lend to ${friend.name}`} checked={lent} disabled={pending} onCheckedChange={onChange} />
      </label>
    </li>
  )
}
