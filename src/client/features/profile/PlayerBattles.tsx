import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { battleFilterActive, type BattleOrder } from '../../../core/battleFilter'
import type { Facet } from '../../../core/serviceRecord'
import { battlesFrom, playerBattlesQuery } from '../../queries'
import { BattleFeedList } from '../battles/BattleFeedList'
import { BattleFilters } from '../battles/BattleFilters'
import { battleFilterOf, type BattleListSearch } from '../battles/battleSearch'

/** Every battle a profile's reader may watch its player in, narrowed from the player's seat the way the battles page narrows a reader's own. */
export function PlayerBattles({
  userId,
  search,
  order,
  onChange,
  opponents,
  signedIn,
  empty,
}: {
  userId: string
  search: BattleListSearch
  order?: BattleOrder
  onChange: (next: BattleListSearch, order: BattleOrder | undefined) => void
  /** Who the player has played, as the record offers them. */
  opponents: readonly Facet[]
  signedIn: boolean
  empty: string
}) {
  const filter = battleFilterOf(search)
  const filtered = battleFilterActive(filter)
  const feed = useInfiniteQuery({ ...playerBattlesQuery(userId, filter, order), placeholderData: keepPreviousData })
  const battles = battlesFrom(feed.data)
  return (
    <div className="space-y-4">
      {battles.length || filtered || order ? (
        <BattleFilters
          view="player"
          search={search}
          onChange={(next) => onChange(next, order)}
          order={order}
          onOrder={(next) => onChange(search, next)}
          signedIn={signedIn}
          updating={feed.isPlaceholderData}
          people={opponents.map((opponent) => ({ id: opponent.value, name: opponent.label, image: opponent.image ?? null }))}
        />
      ) : null}
      <BattleFeedList
        name="Player battles"
        battles={battles}
        feed={feed}
        filtered={filtered}
        order={order}
        empty={<p className="text-sm text-dim">{empty}</p>}
      />
    </div>
  )
}
