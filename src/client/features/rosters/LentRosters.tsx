import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { rostersLentToMe } from '../../functions'
import { factionIndexQuery } from '../../queries'
import type { SavedRoster } from './rosterLibrary'
import { RosterSummary } from './RosterSummary'
import { OwnerLink } from './OwnerLink'

export type LentRoster = Awaited<ReturnType<typeof rostersLentToMe>>[number]

/** Rosters friends have lent this player: links in the library, choices when fielding an army. */
export function LentRosterList({
  rosters,
  selectedId = null,
  disabled = false,
  onChoose,
}: {
  rosters: readonly LentRoster[]
  selectedId?: string | null
  disabled?: boolean
  onChoose?: (roster: SavedRoster) => void
}) {
  const { data: factions } = useQuery(factionIndexQuery())
  return (
    <ul className="space-y-3" data-lent-rosters>
      {rosters.map(({ summary, owner, points, problem }) => {
        const content = (
          <RosterSummary
            roster={summary}
            faction={factions?.factions.find((entry) => entry.id === summary.catalogueId)}
            points={points}
            problem={problem}
            showLock={false}
            showLegality
          />
        )
        const className = 'flex w-full min-w-0 p-3 text-left'
        const selected = summary.id === selectedId
        return (
          <li key={summary.id} className={`border bg-panel hover:border-info hover:bg-raised ${selected ? 'border-info' : 'border-edge'}`}>
            {onChoose ? (
              <button
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                className={`${className} disabled:opacity-60`}
                onClick={() => onChoose(summary)}
              >
                {content}
              </button>
            ) : (
              <Link to="/rosters/$id" params={{ id: summary.id }} className={className}>
                {content}
              </Link>
            )}
            <p className="truncate border-t border-edge px-3 py-2 text-xs text-dim">
              Lent by <OwnerLink owner={owner} />
            </p>
          </li>
        )
      })}
    </ul>
  )
}
