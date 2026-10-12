import { useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { endRosterLoan, lendRoster } from '../../functions'
import { friendshipsQuery, rosterLoansQuery, rostersLentToMeQuery } from '../../queries'
import { errorMessage } from '../../queryClient'

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
            A friend you lend this roster to can view it and field it in their own battles. They cannot edit it, though like any roster they
            can read, they can keep their own copy. Your unit notes and battle preparation stay yours. A battle keeps the army as it was
            when it was fielded, even if you change the roster or stop lending it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {friends.isPending || loans.isPending ? (
            <output className="text-sm text-dim">Loading friends…</output>
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
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
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
