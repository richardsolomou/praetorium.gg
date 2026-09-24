import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { changeLine } from '../../catalogueChanges'
import { rosterChangesQuery } from '../../queries'

const NAMED = 5

/** The data updates since this list was saved that changed something it holds, by name. */
export function RosterDataChanges({ rosterId }: { rosterId: string }) {
  const { data: changes } = useQuery(rosterChangesQuery(rosterId))
  if (!changes?.length) return null
  const more = changes.length - NAMED
  return (
    <p data-roster-changes className="mt-1 text-xs text-discarded">
      Changed since this list was saved:{' '}
      {changes
        .slice(0, NAMED)
        .map((entry) => changeLine(entry.change))
        .join('; ')}
      {more > 0 ? `; and ${more} more` : ''}.{' '}
      <Link to="/changes" className="underline hover:text-bone">
        See data updates
      </Link>
    </p>
  )
}
