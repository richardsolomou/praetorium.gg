import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { outdatedSealedEventEntriesQuery } from '../../queries'
import { eventLink } from '../sealedEvents/sealedEvent'

export function OutdatedSealedEventRosters({ rosterId, saved }: { rosterId: string; saved: boolean }) {
  const { data: entries } = useQuery(outdatedSealedEventEntriesQuery(rosterId))
  if (!entries?.length) return null

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="xs" className="text-discarded hover:text-discarded" aria-label="Sealed roster out of date" />}
      >
        <TriangleAlert className="size-4" aria-hidden />
        Update sealed roster
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(28rem,70dvh)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto">
        <PopoverTitle>Sealed roster out of date</PopoverTitle>
        <div className="space-y-3 text-xs">
          {entries.map((entry) => (
            <div key={entry.token} className="space-y-1">
              <p className="font-semibold">{entry.name}</p>
              <p className="text-dim">Your changes are not in the sealed roster yet.</p>
              {!saved ? (
                <p className="text-parchment">Save changes before replacing it.</p>
              ) : (
                <Link {...eventLink(entry, { choose: true })} className="text-info underline hover:text-bone">
                  Replace sealed roster
                </Link>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
