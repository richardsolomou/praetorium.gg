import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileLock2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Seal a roster</DialogTitle>
          <DialogDescription className="text-dim">
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
                data-roster={roster.name}
                className="flex w-full flex-wrap items-center gap-2 border border-edge bg-panel p-2 hover:border-azure disabled:cursor-wait disabled:opacity-70"
                disabled={pending}
                onClick={() => onChoose(roster)}
              >
                <RosterSummary
                  roster={roster}
                  faction={available?.factions.find((entry) => entry.id === roster.catalogueId)}
                  points={points.get(roster.id)}
                />
                <FileLock2 className="ml-1 size-4 shrink-0 text-parchment" />
              </button>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-edge p-5 text-center">
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
          <Skeleton className="size-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20 rounded-none" />
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
