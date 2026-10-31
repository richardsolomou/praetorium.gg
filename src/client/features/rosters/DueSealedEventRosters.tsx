import { isTeamFormat } from '../../../core/sealedEvent'
import { useQuery } from '@tanstack/react-query'
import { eventFullName, eventLink } from '../sealedEvents/sealedEvent'
import { Link } from '@tanstack/react-router'
import { FileLock2 } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import { sealedEventsQuery } from '../../queries'

/** The way back to every event still waiting for a list of this size, so a list built for one can be sealed there. */
export function DueSealedEventRosters({ limit, pointsBudget, saved }: { limit: number; pointsBudget: number | null; saved: boolean }) {
  const { data: sealedEvents = [] } = useQuery(sealedEventsQuery())
  if (!saved) return null
  // A duel takes lists at its size and points total; a team event, once it seats the player, any list no bigger than its size.
  const fits = (sealedEvent: (typeof sealedEvents)[number], required: number) =>
    isTeamFormat(sealedEvent.format)
      ? sealedEvent.rosterLimit !== null && limit <= sealedEvent.rosterLimit
      : required === limit && pointsBudget === (sealedEvent.pointsBudget ?? null)
  const due = sealedEvents.filter(
    (sealedEvent) =>
      !sealedEvent.revealedAt &&
      sealedEvent.ownEntry?.status === 'accepted' &&
      !sealedEvent.ownEntry.submitted &&
      (sealedEvent.ownEntry.requiredLimit === null
        ? sealedEvent.format === null && pointsBudget === null
        : fits(sealedEvent, sealedEvent.ownEntry.requiredLimit)),
  )
  return due.map((sealedEvent) => (
    <Link
      key={sealedEvent.token}
      {...eventLink(sealedEvent, { choose: true })}
      className={buttonClass({ variant: 'ghost', size: 'xs', className: 'max-w-48 text-parchment' })}
    >
      <FileLock2 className="size-4" aria-hidden />
      <span className="truncate">Seal for {eventFullName(sealedEvent)}</span>
    </Link>
  ))
}
