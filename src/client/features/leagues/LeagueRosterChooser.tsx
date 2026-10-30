import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileLock2, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { savedRosterSummariesQuery } from '../../queries'
import { RosterChoices } from '../rosters/RosterChoices'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { Problem } from '../../components/Problem'
import { battleSizeName, fitsBattleSize, pointsLabel, pointsSize } from '../../../core/battle'

export function RosterChooser({
  open,
  pending,
  error,
  failedRosterId,
  requiredLimit,
  pointsBudget,
  seatPoints,
  shared,
  onClose,
  onChoose,
}: {
  open: boolean
  pending: boolean
  error: Error | null
  failedRosterId: string | null
  requiredLimit: number | null
  /** The event's own points total, which a roster's budget must match; null where the size's full points apply. */
  pointsBudget: number | null
  /** What a team event's seat may spend; its list is built at `requiredLimit` or smaller, with any points total. */
  seatPoints: number | null
  /** Whether the seat splits twice `seatPoints` with an ally rather than spending its own. */
  shared: boolean
  onClose: () => void
  onChoose: (roster: SavedRoster) => void
}) {
  const rosterQuery = useQuery({ ...savedRosterSummariesQuery(), enabled: open })
  const fits = (roster: SavedRoster) =>
    requiredLimit === null ||
    (seatPoints === null
      ? (roster.pointsBudget ?? null) === pointsBudget && roster.limit === requiredLimit
      : fitsBattleSize({ limit: requiredLimit, teamBattle: true }, roster))
  const rosters = (rosterQuery.data ?? []).filter((roster) => !roster.archived && fits(roster))
  const size =
    requiredLimit === null
      ? null
      : seatPoints !== null
        ? pointsSize(seatPoints)
        : pointsBudget
          ? `${pointsLabel(pointsBudget)} ${pointsSize(requiredLimit)}`
          : pointsSize(requiredLimit)
  // Picking a roster and sealing it are two presses, because a seal is what every opponent reads at reveal.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (!open && selectedId !== null) setSelectedId(null)
  const selected = rosters.find((roster) => roster.id === selectedId)
  const failed = error ? rosters.find((roster) => roster.id === failedRosterId) : undefined

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Seal a roster</DialogTitle>
          <DialogDescription>
            {size === null
              ? 'Hidden until the reveal. You can swap it until then.'
              : seatPoints !== null
                ? `Your rosters built for ${battleSizeName(requiredLimit!)} or smaller, ${shared ? `sharing ${pointsLabel(seatPoints * 2)} with your ally` : `spending up to ${pointsLabel(seatPoints)}`}. Hidden until the reveal; you can swap it until then.`
                : `Your ${size} rosters. Hidden until the reveal; you can swap it until then.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error || rosterQuery.error ? <Problem error={error ?? rosterQuery.error} /> : null}
          {failed ? (
            <Link
              to="/rosters/$id"
              params={{ id: failed.id }}
              className={buttonClass({ variant: 'outline', className: 'max-w-full min-w-0 justify-self-start' })}
            >
              <Pencil /> <span className="truncate">Edit {failed.name}</span>
            </Link>
          ) : null}
          {rosterQuery.isPending ? (
            <RosterChooserSkeleton />
          ) : rosters.length ? (
            <RosterChoices rosters={rosters} selectedId={selectedId} disabled={pending} onSelect={(roster) => setSelectedId(roster.id)} />
          ) : (
            <div className="space-y-3">
              <p className="py-2 text-sm text-dim">{size === null ? 'No rosters to seal yet.' : `No ${size} rosters to seal yet.`}</p>
              <Link to="/rosters" search={requiredLimit === null ? {} : { limit: requiredLimit }} className={buttonClass()}>
                {size === null ? 'Go to rosters' : `Build a ${size} roster`}
              </Link>
            </div>
          )}
        </DialogBody>
        {rosters.length ? (
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button className="max-w-full min-w-0" disabled={!selected || pending} onClick={() => selected && onChoose(selected)}>
              <FileLock2 />
              <span className="truncate">{pending ? 'Sealing…' : selected ? `Seal ${selected.name}` : 'Choose a roster to seal'}</span>
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RosterChooserSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading rosters">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex min-h-20 items-center gap-3 border border-edge bg-panel p-3" aria-hidden>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}
