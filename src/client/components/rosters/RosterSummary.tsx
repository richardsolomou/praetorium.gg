import { GAME_SIZES } from '../../../core/battle'
import { formatDate } from '../../dates'
import { FactionLabel, type FactionPresentation } from '../FactionMark'
import type { SavedRoster } from './rosterLibrary'

export type RosterSummaryFaction = FactionPresentation & { detachments: { id: string; name: string }[] }

export function RosterSummary({
  roster,
  faction,
  points,
}: {
  roster: SavedRoster
  faction?: RosterSummaryFaction
  points?: number | null
}) {
  const detachments = roster.detachmentIds.map((id) => faction?.detachments.find((entry) => entry.id === id)?.name).filter(Boolean)
  const size = GAME_SIZES.find((entry) => entry.limit === roster.limit)

  return (
    <>
      <span className="min-w-0 basis-full flex-1 text-left sm:basis-auto">
        <span className="block truncate font-bold uppercase">{roster.name}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {faction ? <FactionLabel faction={faction} chip /> : null}
          {detachments.map((name) => (
            <span key={name} className="chip">
              {name}
            </span>
          ))}
        </span>
        <span className="mt-1 block text-xs text-dim">
          11th edition · {size?.name ?? `${roster.limit} points`} · {roster.unitCount} units · updated {formatDate(roster.updatedAt)}
        </span>
      </span>
      <span className="ml-auto shrink-0 text-right">
        <span className="readout block text-lg font-bold">
          {points ?? '—'}/{roster.limit}
        </span>
        <span className="text-xs text-dim">{roster.visibility === 'private' ? 'Private' : 'Unlisted'}</span>
      </span>
    </>
  )
}
