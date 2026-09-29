import { useQuery } from '@tanstack/react-query'
import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ROSTER_LIBRARY_BATCH_SIZE } from '../../../core/rosterLibrary'
import { variantCards, variantGroups } from '../../../core/rosterVariants'
import { factionIndexQuery, gameReferencesQuery } from '../../queries'
import type { SavedRoster } from './rosterLibrary'
import { useRosterPages } from './rosterPages'
import { sortRosters } from './rosterSort'
import { type RosterRowLayout, rosterRowFrame } from './RosterRow'
import { RosterSummary, RosterVariantSummary, rosterTitle } from './RosterSummary'

/**
 * Saved lists to choose one of, drawn the way the library draws them: each base on a
 * card with its variants and what they change, and each list's points and legality,
 * because two variants of one list are otherwise easy to mistake for each other.
 */
export function RosterChoices({
  rosters,
  selectedId,
  disabled = false,
  onSelect,
}: {
  /** Already narrowed to the lists that may be chosen. */
  rosters: readonly SavedRoster[]
  selectedId: string | null
  disabled?: boolean
  onSelect: (roster: SavedRoster) => void
}) {
  const [shownCount, setShownCount] = useState(ROSTER_LIBRARY_BATCH_SIZE)
  const { data: available, isPending: factionsLoading } = useQuery(factionIndexQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  // Recently updated first, the library's own default: its chosen order lives in a cookie scoped to `/rosters`.
  const shown = variantGroups(sortRosters(rosters, 'updated-desc')).slice(0, shownCount)
  const pages = useRosterPages(
    shown.map(({ roster }) => roster.id),
    true,
  )

  const choice = ({ roster, index }: { roster: SavedRoster; index: number }, layout: RosterRowLayout, headVisibility: string) => {
    const faction = available?.factions.find((entry) => entry.id === roster.catalogueId)
    const page = pages.byId.get(roster.id)
    const selected = roster.id === selectedId
    const summary = {
      roster,
      faction,
      points: page?.points,
      label: page?.label,
      dispositionName: references?.dispositions.find((entry) => entry.id === roster.disposition)?.name,
      pointsLoading: pages.pending(index),
      problem: page?.problem ?? null,
      differences: page?.differences ?? null,
    }
    return (
      <button
        key={roster.id}
        type="button"
        aria-pressed={selected}
        data-roster={rosterTitle(roster, faction, page?.label)}
        data-variant={layout === 'variant' || undefined}
        disabled={disabled}
        onClick={() => onSelect(roster)}
        className={`flex w-full items-center gap-2 p-2 text-left disabled:cursor-wait disabled:opacity-70 ${rosterRowFrame[layout]} ${
          selected ? 'bg-raised ring-1 ring-parchment ring-inset' : ''
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 p-1">
          {layout === 'variant' ? (
            <RosterVariantSummary {...summary} showVisibility={roster.visibility !== headVisibility} />
          ) : (
            <RosterSummary {...summary} factionLoading={factionsLoading} />
          )}
        </span>
        <CircleCheck className={`size-5 shrink-0 ${selected ? 'text-parchment' : 'text-transparent'}`} aria-hidden />
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {variantCards(shown).map(({ head, variants }) =>
        variants.length ? (
          <div key={head.roster.id} data-roster-group className="border border-edge bg-panel">
            {choice(head, 'base', head.roster.visibility)}
            {variants.map((variant) => choice(variant, 'variant', head.roster.visibility))}
          </div>
        ) : (
          choice(head, 'card', head.roster.visibility)
        ),
      )}
      {shown.length < rosters.length ? (
        <Button
          variant="outline"
          disabled={pages.results.some((result) => !result.isSuccess)}
          onClick={() => setShownCount((count) => count + ROSTER_LIBRARY_BATCH_SIZE)}
        >
          Show more rosters
        </Button>
      ) : null}
    </div>
  )
}
