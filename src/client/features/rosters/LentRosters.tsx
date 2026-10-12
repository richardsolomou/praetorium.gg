import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { rostersLentToMe } from '../../functions'
import { factionIndexQuery } from '../../queries'
import type { SavedRoster } from './rosterLibrary'

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
    <ul className="space-y-2" data-lent-rosters>
      {rosters.map(({ summary, owner }) => {
        const faction = factions?.factions.find((entry) => entry.id === summary.catalogueId)
        const content = (
          <>
            <span className="block truncate font-bold uppercase">{summary.name || faction?.displayName || 'Unnamed roster'}</span>
            <span className="block text-xs text-dim">
              {faction && summary.name ? `${faction.displayName} · ` : ''}
              {summary.limit} points · Lent by {owner.name}
            </span>
          </>
        )
        const className = 'block w-full border border-edge bg-sunken p-3 text-left hover:border-info'
        return (
          <li key={summary.id}>
            {onChoose ? (
              <button
                type="button"
                aria-pressed={summary.id === selectedId}
                disabled={disabled}
                className={`${className} disabled:opacity-60 aria-pressed:border-info`}
                onClick={() => onChoose(summary)}
              >
                {content}
              </button>
            ) : (
              <Link to="/rosters/$id" params={{ id: summary.id }} className={className}>
                {content}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
