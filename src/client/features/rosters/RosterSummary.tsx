import { GAME_SIZES } from '../../../core/battle'
import { rosterLabel } from '../../../core/rosterLabel'
import { useDateFormatting } from '../../dates'
import { Skeleton } from '@/components/ui/skeleton'
import { FactionLabel, type FactionPresentation } from '../../components/FactionMark'
import { rosterWaivers, WaiverChip } from '../../components/FormatWaivers'
import { dispositionTone } from '../../components/rosterSetup'
import type { NamedRosterDifferences } from '../../../core/rosterDifferences'
import { CornerDownRight } from 'lucide-react'
import { RosterDifferenceChips, type VariantSetup } from './RosterDifferences'
import type { SavedRoster } from './rosterLibrary'
import { VISIBILITY_NAME } from './visibility'
import type { CatalogueEdition } from '../../../core/catalogueEdition'

export type RosterSummaryFaction = FactionPresentation & { edition?: CatalogueEdition | null; detachments: { id: string; name: string }[] }
export type RosterProblem = 'over-limit' | 'not-legal'

export const PROBLEM_LABEL: Record<RosterProblem, string> = { 'over-limit': 'Over limit', 'not-legal': 'Not legal' }

/**
 * What to call this list on screen: its own name, or the label folded from it.
 *
 * The units are the expensive half of a label and arrive with the totals, so a row
 * that is still waiting says what its setup alone can — the same fold, with less to
 * fold. Exported because the row's menu and its heading must agree.
 */
export function rosterTitle(roster: SavedRoster, faction?: RosterSummaryFaction, label?: string) {
  if (roster.name) return roster.name
  if (label) return label
  return rosterLabel({
    factionName: faction?.displayName,
    detachmentNames: detachmentNames(roster, faction),
    limit: roster.limit,
  })
}

const detachmentNames = (roster: SavedRoster, faction?: RosterSummaryFaction) =>
  roster.detachmentIds
    .map((id) => faction?.detachments.find((entry) => entry.id === id)?.name)
    .filter((name): name is string => Boolean(name))

const variantSetup = (roster: SavedRoster, faction?: RosterSummaryFaction, dispositionName?: string): VariantSetup => ({
  factionName: faction?.displayName,
  detachmentName: (id) => faction?.detachments.find((entry) => entry.id === id)?.name,
  disposition: roster.disposition && dispositionName ? { id: roster.disposition, name: dispositionName } : null,
})

export function RosterSummary({
  roster,
  faction,
  points,
  label,
  dispositionName,
  factionLoading = false,
  pointsLoading = false,
  problem = null,
  differences = null,
}: {
  roster: SavedRoster
  faction?: RosterSummaryFaction
  points?: number | null
  /** What an unnamed list is called, folded from its units. Absent until the totals land. */
  label?: string
  /** A variant drawn without its base above it, such as when a filter leaves the base out, says what it varies. */
  differences?: NamedRosterDifferences | null
  dispositionName?: string
  factionLoading?: boolean
  pointsLoading?: boolean
  problem?: RosterProblem | null
}) {
  const { date } = useDateFormatting()
  const detachments = detachmentNames(roster, faction)
  const size = GAME_SIZES.find((entry) => entry.limit === roster.limit)
  const waivers = rosterWaivers(roster)

  return (
    // A phone puts the name beside the points and gives the chips and details full lines beneath; a wider screen keeps the points in a column of their own.
    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 text-left">
      <span className="min-w-0 truncate font-bold uppercase">{rosterTitle(roster, faction, label)}</span>
      <RosterStanding
        roster={roster}
        points={points}
        pointsLoading={pointsLoading}
        problem={problem}
        visibilityInDetails
        className={`col-start-2 row-start-1 sm:self-center ${differences ? 'sm:row-span-4' : 'sm:row-span-3'}`}
      />
      <span data-slot="roster-chips" className="col-span-2 flex flex-wrap gap-1 *:whitespace-nowrap sm:col-span-1">
        {faction ? <FactionLabel faction={faction} chip /> : factionLoading ? <Skeleton className="h-5 w-24" /> : null}
        {detachments.map((name) => (
          <span key={name} className="chip">
            {name}
          </span>
        ))}
        {roster.disposition && dispositionName ? (
          <span className={`chip ${dispositionTone(roster.disposition)}`}>{dispositionName}</span>
        ) : null}
        <WaiverChip rules={waivers} />
      </span>
      <span className="col-span-2 block text-xs text-dim sm:col-span-1">
        11th edition · {size?.name ?? `${roster.limit} points`} · {roster.unitCount} {roster.unitCount === 1 ? 'unit' : 'units'} ·{' '}
        <span className="sm:hidden">{VISIBILITY_NAME[roster.visibility]} · </span>updated {date(roster.updatedAt)}
      </span>
      {differences ? (
        <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim sm:col-span-1">
          <span className="flex shrink-0 items-center gap-1">
            <CornerDownRight className="size-3.5 text-faint" aria-hidden />
            Variant of {differences.baseName}
          </span>
          <RosterDifferenceChips differences={differences} setup={variantSetup(roster, faction, dispositionName)} />
        </span>
      ) : null}
    </span>
  )
}

/** Points against the limit, over whether the list can be fielded and who can read it. */
function RosterStanding({
  roster,
  points,
  pointsLoading,
  problem,
  compact = false,
  showVisibility = true,
  visibilityInDetails = false,
  className = '',
}: {
  roster: SavedRoster
  points?: number | null
  pointsLoading: boolean
  problem: RosterProblem | null
  compact?: boolean
  showVisibility?: boolean
  /** A phone reads the visibility in the details line instead, so the points take one line. */
  visibilityInDetails?: boolean
  className?: string
}) {
  const wideOnly = visibilityInDetails ? 'hidden sm:inline' : ''
  return (
    // Wide enough for a warning beside the visibility, so one arriving late moves nothing; a phone's variant row cannot spare it.
    <span className={`ml-auto shrink-0 text-right ${compact ? 'sm:min-w-28' : 'min-w-28'} ${className}`}>
      {pointsLoading ? (
        <Skeleton className={`ml-auto w-20 ${compact ? 'h-4' : 'h-5'}`} />
      ) : (
        <span className={`readout block font-bold ${compact ? 'text-sm' : 'text-lg'}`}>
          {points ?? '—'}/{roster.limit}
        </span>
      )}
      {problem || showVisibility ? (
        <span className={`text-xs whitespace-nowrap text-dim ${problem || !visibilityInDetails ? 'block' : 'hidden sm:block'}`}>
          {problem ? <span className="font-semibold text-destructive">{PROBLEM_LABEL[problem]}</span> : null}
          {problem && showVisibility ? <span className={wideOnly}> · </span> : null}
          {showVisibility ? <span className={wideOnly}>{VISIBILITY_NAME[roster.visibility]}</span> : null}
        </span>
      ) : null}
    </span>
  )
}

/**
 * A variant inside its base's card: the name and what it changes, since the faction,
 * detachments and size it shares with the base are already printed above it.
 */
export function RosterVariantSummary({
  roster,
  faction,
  points,
  label,
  dispositionName,
  pointsLoading = false,
  problem = null,
  differences,
  showVisibility,
}: {
  roster: SavedRoster
  faction?: RosterSummaryFaction
  points?: number | null
  label?: string
  dispositionName?: string
  pointsLoading?: boolean
  problem?: RosterProblem | null
  differences?: NamedRosterDifferences | null
  /** Only when it differs from the base's, which the card already shows. */
  showVisibility: boolean
}) {
  return (
    // A phone gives the chips their own line beneath the name and points; a wider screen keeps the row to one.
    <span className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 text-left sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
      <CornerDownRight className="size-4 text-faint" aria-hidden />
      <span className="min-w-0 truncate text-sm font-bold uppercase sm:max-w-64">{rosterTitle(roster, faction, label)}</span>
      <span className="col-span-2 col-start-2 row-start-2 flex min-h-[1.125rem] min-w-0 items-center sm:col-span-1 sm:col-start-3 sm:row-start-1">
        {differences ? (
          <RosterDifferenceChips differences={differences} setup={variantSetup(roster, faction, dispositionName)} />
        ) : pointsLoading ? (
          <Skeleton className="h-4 w-40" aria-label="Loading changes from base" />
        ) : null}
      </span>
      <RosterStanding
        roster={roster}
        points={points}
        pointsLoading={pointsLoading}
        problem={problem}
        compact
        showVisibility={showVisibility}
        className="col-start-3 row-start-1 sm:col-start-4"
      />
    </span>
  )
}
