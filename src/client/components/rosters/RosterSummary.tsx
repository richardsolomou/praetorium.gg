import { GAME_SIZES } from '../../../core/battle'
import { formatDate } from '../../dates'
import { Skeleton } from '@/components/ui/skeleton'
import { FactionLabel, type FactionPresentation } from '../FactionMark'
import { rosterWaivers, WaiverChip } from '../FormatWaivers'
import type { SavedRoster } from './rosterLibrary'

export type RosterSummaryFaction = FactionPresentation & { detachments: { id: string; name: string }[] }

export function RosterSummary({
  roster,
  faction,
  points,
  factionLoading = false,
  pointsLoading = false,
}: {
  roster: SavedRoster
  faction?: RosterSummaryFaction
  points?: number | null
  factionLoading?: boolean
  pointsLoading?: boolean
}) {
  const detachments = roster.detachmentIds.map((id) => faction?.detachments.find((entry) => entry.id === id)?.name).filter(Boolean)
  const size = GAME_SIZES.find((entry) => entry.limit === roster.limit)
  const waivers = rosterWaivers(roster)

  return (
    <>
      <span className="min-w-0 basis-full flex-1 text-left sm:basis-auto">
        <span className="block truncate font-bold uppercase">{roster.name}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {faction ? <FactionLabel faction={faction} chip /> : factionLoading ? <Skeleton className="h-5 w-24" /> : null}
          {detachments.map((name) => (
            <span key={name} className="chip">
              {name}
            </span>
          ))}
          <WaiverChip rules={waivers} />
        </span>
        <span className="mt-1 block text-xs text-dim">
          11th edition · {size?.name ?? `${roster.limit} points`} · {roster.unitCount} units · updated {formatDate(roster.updatedAt)}
        </span>
      </span>
      <span className="ml-auto shrink-0 text-right">
        {pointsLoading ? (
          <Skeleton className="ml-auto h-5 w-20" />
        ) : (
          <span className="readout block text-lg font-bold">
            {points ?? '—'}/{roster.limit}
          </span>
        )}
        <span className="text-xs text-dim">{roster.visibility === 'private' ? 'Private' : 'Unlisted'}</span>
      </span>
    </>
  )
}
