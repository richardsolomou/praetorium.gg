import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleCheck, FileLock2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '../../queryClient'
import { factionIndexQuery, savedRosterSummariesQuery, savedRosterTotalsQuery } from '../../queries'
import { RosterSummary } from '../rosters/RosterSummary'
import type { SavedRoster } from '../rosters/rosterLibrary'

export function RosterChooser({
  open,
  pending,
  error,
  requiredLimit,
  onClose,
  onChoose,
}: {
  open: boolean
  pending: boolean
  error: Error | null
  requiredLimit: number | null
  onClose: () => void
  onChoose: (roster: SavedRoster) => void
}) {
  const rosterQuery = useQuery({ ...savedRosterSummariesQuery(), enabled: open })
  const { data: available } = useQuery({ ...factionIndexQuery(), enabled: open })
  const { data: prices } = useQuery({ ...savedRosterTotalsQuery(), enabled: open })
  const rosters = (rosterQuery.data ?? []).filter((roster) => requiredLimit === null || roster.limit === requiredLimit)
  const points = new Map((prices ?? []).map((entry) => [entry.id, entry.points]))
  // Picking a list and sealing it are two presses, because a seal is what every opponent reads at reveal.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!open) setSelectedId(null)
  }, [open])
  const selected = rosters.find((roster) => roster.id === selectedId)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Seal a roster</DialogTitle>
          <DialogDescription>
            {requiredLimit === null
              ? 'Nobody sees it until reveal, and you can swap it until then.'
              : `Only your ${requiredLimit.toLocaleString()}-point lists. Nobody sees it until reveal, and you can swap it until then.`}
          </DialogDescription>
        </DialogHeader>
        {error || rosterQuery.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error ?? rosterQuery.error)}
          </p>
        ) : null}
        {rosterQuery.isPending ? (
          <RosterChooserSkeleton />
        ) : rosters.length ? (
          <div className="space-y-2">
            {rosters.map((roster) => (
              <button
                key={roster.id}
                type="button"
                aria-pressed={roster.id === selectedId}
                data-roster={roster.name}
                className={`flex w-full flex-wrap items-center gap-2 border p-2 disabled:cursor-wait disabled:opacity-70 ${roster.id === selectedId ? 'border-parchment bg-raised' : 'border-edge bg-panel hover:border-info'}`}
                disabled={pending}
                onClick={() => setSelectedId(roster.id)}
              >
                <RosterSummary
                  roster={roster}
                  faction={available?.factions.find((entry) => entry.id === roster.catalogueId)}
                  points={points.get(roster.id)}
                />
                <CircleCheck
                  className={`ml-1 size-5 shrink-0 ${roster.id === selectedId ? 'text-parchment' : 'text-transparent'}`}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="border border-edge bg-panel p-5 text-center">
            <p className="text-sm text-dim">
              {requiredLimit === null
                ? 'Build or import a list first.'
                : `Build or import a ${requiredLimit.toLocaleString()}-point list first.`}
            </p>
            <Button
              className="mt-3"
              nativeButton={false}
              render={<Link to="/rosters" search={requiredLimit === null ? {} : { limit: requiredLimit }} />}
            >
              Go to rosters
            </Button>
          </div>
        )}
        {rosters.length ? (
          <DialogFooter className="sticky bottom-0 bg-popover">
            <Button variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button className="max-w-full min-w-0" disabled={!selected || pending} onClick={() => selected && onChoose(selected)}>
              <FileLock2 />
              <span className="truncate">{pending ? 'Sealing…' : selected ? `Seal ${selected.name}` : 'Choose a list to seal'}</span>
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function LeagueBattleSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading battles">
      <Skeleton className="h-4 w-20" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex min-h-20 items-center gap-3 border border-edge bg-panel p-3" aria-hidden>
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
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
