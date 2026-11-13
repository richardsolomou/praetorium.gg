import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Lock, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { endRosterLoan } from '../../functions'
import { useNativeShare } from '../../nativeBridge'
import { rostersLentToMeQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { RosterDataChanges } from './RosterDataChanges'
import { RosterRulesNotice } from './RosterRulesNotice'
import type { RosterActions } from './useRosterActions'

/** What the roster header says below the name: the lock, what an action could not do, where the list came from, and what its setup needs. */
export function RosterHeaderNotices({
  editable,
  locked,
  frozen,
  savedId,
  signedInAs,
  actions: { lockRoster, duplicateRoster, createVariant, splitVariant, share, exchange },
  requestRefusal,
  copiedFrom,
  lentBy,
  edition,
  currentRules,
  onSetup,
  onConvert,
  detachmentError,
  dispositionError,
}: {
  editable: boolean
  locked: boolean
  frozen: boolean
  savedId: string
  signedInAs?: string
  actions: RosterActions
  requestRefusal: string | null
  copiedFrom: { id: string; name: string; ownerId: string; ownerName: string } | null
  lentBy: { id: string; name: string } | null
  edition: Parameters<typeof RosterRulesNotice>[0]['edition']
  currentRules: string | null
  onSetup: () => void
  onConvert?: () => void
  detachmentError?: string | null
  dispositionError?: string | null
}) {
  const nativeShare = useNativeShare()
  return (
    <>
      {locked ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-dim">
          <Lock className="size-3 shrink-0" aria-hidden />
          Locked. Unlock to edit, or create a variant.
          <Button variant="link" size="xs" className="h-auto p-0" disabled={lockRoster.isPending} onClick={() => lockRoster.mutate(false)}>
            Unlock
          </Button>
        </p>
      ) : null}
      {lockRoster.isError ? <Problem error={lockRoster.error} className="mt-1 text-xs" /> : null}
      {!editable && duplicateRoster.isError ? (
        <Problem className="mt-1 text-xs">That roster could not be duplicated. Try again.</Problem>
      ) : null}
      {createVariant.isError ? <Problem className="mt-1 text-xs">The variant could not be created. Try again.</Problem> : null}
      {splitVariant.isError ? <Problem error={splitVariant.error} className="mt-1 text-xs" /> : null}
      {share.isError ? (
        <Problem className="mt-1 text-xs">Could not share the link: {errorMessage(share.error)}</Problem>
      ) : (
        <output className="mt-1 block text-xs text-dim empty:hidden">
          {share.isPending
            ? nativeShare
              ? 'Sharing link…'
              : 'Copying link…'
            : share.data === 'shared'
              ? 'Link shared.'
              : share.data === 'copied'
                ? 'Link copied.'
                : null}
        </output>
      )}
      {exchange.isError ? (
        <Problem className="mt-1 text-xs">Could not make an exchange code: {errorMessage(exchange.error)}</Problem>
      ) : null}
      {requestRefusal ? (
        <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-discarded">
          <TriangleAlert className="size-3 shrink-0" aria-hidden />
          The unit was not added. {requestRefusal}
        </p>
      ) : null}
      {copiedFrom ? (
        <p data-roster-copied-from className="mt-1 text-xs text-dim">
          Copied from{' '}
          <Link to="/rosters/$id" params={{ id: copiedFrom.id }} className="text-info hover:text-parchment">
            {copiedFrom.name}
          </Link>{' '}
          by{' '}
          <Link to="/users/$userId" params={{ userId: copiedFrom.ownerId }} className="text-info hover:text-parchment">
            {copiedFrom.ownerName}
          </Link>
        </p>
      ) : null}
      {lentBy && savedId && signedInAs ? <LentBy rosterId={savedId} borrowerId={signedInAs} lender={lentBy} /> : null}
      {savedId && !frozen ? <RosterDataChanges rosterId={savedId} /> : null}
      {!frozen ? <RosterRulesNotice edition={edition} current={currentRules} onConvert={onConvert} /> : null}
      {editable && detachmentError ? (
        <Problem className="mt-1 flex items-center gap-1.5 text-xs">
          <TriangleAlert className="size-3 shrink-0" aria-hidden />
          {detachmentError}
          <Button variant="ghost" size="xs" className="h-auto p-0 text-destructive underline hover:text-destructive" onClick={onSetup}>
            Review setup
          </Button>
        </Problem>
      ) : null}
      {editable && dispositionError ? (
        <Problem className="mt-1 flex items-center gap-1.5 text-xs">
          <TriangleAlert className="size-3 shrink-0" aria-hidden />
          {dispositionError} Its detachments disagree, so a battle cannot pick a mission for it.
          <Button variant="ghost" size="xs" className="h-auto p-0 text-destructive underline hover:text-destructive" onClick={onSetup}>
            Choose one
          </Button>
        </Problem>
      ) : null}
    </>
  )
}

/** A borrowed list, which its borrower can give back to the friend who lent it. */
function LentBy({ rosterId, borrowerId, lender }: { rosterId: string; borrowerId: string; lender: { id: string; name: string } }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [returning, setReturning] = useState(false)
  const returnLoan = useMutation({
    mutationFn: () => endRosterLoan({ data: { id: rosterId, borrowerId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: rostersLentToMeQuery().queryKey })
      await navigate({ to: '/rosters' })
    },
  })
  return (
    <div data-roster-lent-by className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
      <span>
        Lent to you by{' '}
        <Link to="/users/$userId" params={{ userId: lender.id }} className="text-info hover:text-parchment">
          {lender.name}
        </Link>
        . You can field it in your battles.
      </span>
      <Button
        variant="outline"
        size="xs"
        onClick={() => {
          returnLoan.reset()
          setReturning(true)
        }}
      >
        Return it
      </Button>
      <ConfirmDialog
        open={returning}
        title={`Return ${lender.name}’s roster?`}
        description={`You can no longer field it in your battles. Only ${lender.name} can lend it to you again.`}
        cancel="Keep it"
        confirm="Return it"
        pendingLabel="Returning…"
        destructive
        pending={returnLoan.isPending}
        error={returnLoan.error}
        onClose={() => setReturning(false)}
        onConfirm={() => returnLoan.mutate()}
      />
    </div>
  )
}
