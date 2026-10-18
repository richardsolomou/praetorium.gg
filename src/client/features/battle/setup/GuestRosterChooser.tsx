import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../../components/buttonClass'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/Dialog'
import { Problem } from '../../../components/Problem'
import { pointsBudgetOf, pointsLabel } from '../../../../core/battle'
import { factionIndexQuery } from '../../../queries'
import { useClientValue } from '../../../useClientValue'
import { claimInput, peekGuestDraft, type GuestDraft } from '../../rosters/guestDraft'
import { countLabel } from '../../../text'

/**
 * A guest's roster comes from the builder on this device, the same one a visitor uses, since a guest has no saved lists.
 * The server prices and checks the draft when it is brought, exactly as it checks a saved one.
 */
export function GuestRosterChooser({
  open,
  onOpenChange,
  pending,
  problem,
  onChoose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  problem: string | null
  onChoose: (draft: ReturnType<typeof claimInput>) => void
}) {
  const guest = useClientValue(peekGuestDraft, null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" fit>
        <DialogHeader>
          <DialogTitle className="text-2xl">Choose your roster</DialogTitle>
          <DialogDescription>
            Build or import a list in the roster builder. This device keeps it, and you can bring it here without an account.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {guest ? <DraftChoice guest={guest} pending={pending} onChoose={() => onChoose(claimInput(guest))} /> : null}
          <div className="flex flex-wrap gap-2">
            {guest ? (
              <Link to="/rosters/$id" params={{ id: guest.id }} className={buttonClass({ variant: 'outline', size: 'sm' })}>
                Edit it in the builder
              </Link>
            ) : (
              <Link to="/rosters" className={buttonClass({ size: 'sm' })}>
                Build or import a roster
              </Link>
            )}
          </div>
          {problem ? <Problem>{problem}</Problem> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function DraftChoice({ guest, pending, onChoose }: { guest: GuestDraft; pending: boolean; onChoose: () => void }) {
  const { data: index } = useQuery(factionIndexQuery())
  const faction = index?.factions.find((candidate) => candidate.id === guest.draft.catalogueId)
  return (
    <div data-roster="guest-draft" className="flex flex-col gap-3 border border-edge bg-sunken p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <span className="eyebrow block">On this device</span>
        <span className="block font-bold break-words uppercase">{guest.draft.name || 'Your roster'}</span>
        <span className="block text-xs text-dim">
          {[faction?.displayName, countLabel(guest.draft.picks.length, 'unit'), pointsLabel(pointsBudgetOf(guest.draft))]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <Button size="sm" disabled={pending || !guest.draft.picks.length} onClick={onChoose}>
        Bring this roster
      </Button>
    </div>
  )
}
