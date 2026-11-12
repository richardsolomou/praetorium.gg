import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ROSTER_SEARCH_MAX_LENGTH } from '../../../../core/rosterDiscovery'
import { SearchField } from '../../../components/SearchField'
import { SectionHeading } from '../../../components/SectionHeading'
import { Problem } from '../../../components/Problem'
import { discoveredRostersQuery } from '../../../queries'
import { errorMessage } from '../../../queryClient'
import { LentRosterList } from '../../rosters/LentRosters'
import type { SavedRoster } from '../../rosters/rosterLibrary'

/**
 * Other players' legal public rosters at this battle's size, for a practice opponent to field.
 *
 * The list is fielded as it stands and never copied, so trying a matchup leaves the player's library as it was.
 */
export function PublicRosterChoices({
  limit,
  selectedId,
  disabled,
  onChoose,
}: {
  limit: number | null
  selectedId: string | null
  disabled: boolean
  onChoose: (roster: SavedRoster) => void
}) {
  const [search, setSearch] = useState('')
  const q = useDeferredValue(search.trim()) || undefined
  const filter = { q, legality: { in: ['legal'], out: [] }, ...(limit === null ? {} : { size: { in: [String(limit)], out: [] } }) }
  const query = useInfiniteQuery({ ...discoveredRostersQuery(filter, 'public', 'updated-desc'), placeholderData: keepPreviousData })
  const rosters = (query.data?.pages ?? []).flatMap((page) => page.rosters).map(({ roster, ...entry }) => ({ ...entry, summary: roster }))
  return (
    <section className="space-y-2" data-public-rosters>
      <SectionHeading title="Public rosters" className="mb-0" />
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Search by name, army or player"
        label="Search public rosters"
        clearLabel="Clear the public roster search"
        maxLength={ROSTER_SEARCH_MAX_LENGTH}
      />
      {query.error ? <Problem>{errorMessage(query.error)}</Problem> : null}
      {query.isPending ? (
        <div className="space-y-2" aria-label="Loading public rosters">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : rosters.length ? (
        <LentRosterList rosters={rosters} credit="By" selectedId={selectedId} disabled={disabled} onChoose={onChoose} />
      ) : (
        <p className="rounded-lg border border-edge bg-sunken p-4 text-sm text-dim">
          {q ? 'No public roster matches that search.' : 'Nobody has made a roster of this size public yet.'}
        </p>
      )}
      {query.hasNextPage ? (
        <Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      ) : null}
    </section>
  )
}
