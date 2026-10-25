import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { outdatedLeagueEntriesQuery } from '../../queries'

export function OutdatedLeagueRosters({ rosterId, saved }: { rosterId: string; saved: boolean }) {
  const { data: entries } = useQuery(outdatedLeagueEntriesQuery(rosterId))
  if (!entries?.length) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="xs" className="text-discarded hover:text-discarded" aria-label="Tournament roster out of date" />
        }
      >
        <TriangleAlert className="size-4" aria-hidden />
        Update tournament
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(28rem,70dvh)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto">
        <PopoverTitle>Tournament roster out of date</PopoverTitle>
        <div className="space-y-3 text-xs">
          {entries.map((entry) => (
            <div key={`${entry.leagueToken}:${entry.eventToken}`} className="space-y-1">
              <p className="font-semibold">{entry.leagueName}</p>
              <p className="text-dim">Your changes are not in the tournament roster yet.</p>
              {!saved ? (
                <p className="text-parchment">Save changes before replacing it.</p>
              ) : (
                <Link
                  to="/tournaments/$token"
                  params={{ token: entry.leagueToken }}
                  search={{ event: entry.eventToken, choose: true }}
                  className="text-info underline hover:text-bone"
                >
                  Replace tournament roster
                </Link>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
