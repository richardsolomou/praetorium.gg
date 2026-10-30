import { CalendarDays } from 'lucide-react'
import { useMoment } from '../../dates'
import { cn } from '@/lib/utils'

/** When an event is played and its roster deadline, in the reader's timezone; nothing when neither is set. */
export function EventSchedule({ event, className }: { event: { playsAt: number | null; sealBy: number | null }; className?: string }) {
  const moment = useMoment()
  if (event.playsAt === null && event.sealBy === null) return null
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 text-sm text-dim', className)}>
      <CalendarDays className="size-3.5 shrink-0" aria-hidden />
      {[
        event.playsAt === null ? null : `Played ${moment(event.playsAt)}`,
        event.sealBy === null ? null : `Rosters due ${moment(event.sealBy)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
  )
}
