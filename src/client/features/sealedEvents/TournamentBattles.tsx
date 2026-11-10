import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { battleFilterActive, type BattleOrder } from '../../../core/battleFilter'
import { SectionHeading } from '../../components/SectionHeading'
import { battlesFrom, sealedEventBattlesQuery } from '../../queries'
import type { Battle } from '../battles/battle'
import { BattleFeedList } from '../battles/BattleFeedList'
import { BattleFilters } from '../battles/BattleFilters'
import { battleFilterOf, type BattleListSearch } from '../battles/battleSearch'
import type { SealedEvent } from './sealedEvent'

/**
 * A tournament's battles, narrowed the way the battles page narrows a feed.
 *
 * Its own read, apart from the unfiltered one the rounds and the open table count from, so narrowing the list never
 * changes who the page says has played whom.
 */
export function TournamentBattles({
  sealedEvent,
  token,
  search,
  order,
  onChange,
  viewerId,
  label,
}: {
  sealedEvent: SealedEvent
  token: string
  search: BattleListSearch
  order?: BattleOrder
  onChange: (next: BattleListSearch, order: BattleOrder | undefined) => void
  viewerId: string | null
  label?: (battle: Battle) => string
}) {
  const filter = battleFilterOf(search)
  const filtered = battleFilterActive(filter)
  const feed = useInfiniteQuery({
    ...sealedEventBattlesQuery(token, sealedEvent.eventToken, filter, order),
    placeholderData: keepPreviousData,
  })
  const battles = battlesFrom(feed.data)
  const entrants = sealedEvent.entries.filter((entry) => entry.status === 'accepted')
  return (
    <section>
      {battles.length || !feed.isPending ? <SectionHeading title="Battles" count={filtered ? undefined : battles.length} /> : null}
      <div className="space-y-4">
        {battles.length || filtered || order ? (
          <BattleFilters
            view="tournament"
            search={search}
            onChange={(next) => onChange(next, order)}
            order={order}
            onOrder={(next) => onChange(search, next)}
            signedIn={Boolean(viewerId)}
            updating={feed.isPlaceholderData}
            people={entrants.map((entry) => ({ id: entry.userId, name: entry.name, image: entry.image }))}
          />
        ) : null}
        <BattleFeedList
          name="Battles"
          battles={battles}
          feed={feed}
          filtered={filtered}
          order={order}
          viewerId={viewerId ?? undefined}
          label={label}
          empty={<p className="text-sm text-dim">No battles yet. Battles started from this page show up here.</p>}
        />
      </div>
    </section>
  )
}
