import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { battleFilterActive, type BattleOrder } from '../../../core/battleFilter'
import { battlesFrom, groupBattlesQuery } from '../../queries'
import type { Battle } from '../battles/battle'
import { BattleFeedList } from '../battles/BattleFeedList'
import { BattleFilters } from '../battles/BattleFilters'
import { battleFilterOf, type BattleListSearch } from '../battles/battleSearch'
import type { Group } from './group'

/** Every battle played for the group, of every kind, narrowed the way the battles page narrows a feed. */
export function GroupBattles({
  group,
  search,
  order,
  onChange,
  viewerId,
  label,
}: {
  group: Group
  search: BattleListSearch
  order?: BattleOrder
  onChange: (next: BattleListSearch, order: BattleOrder | undefined) => void
  viewerId: string | null
  /** Names what a battle was played for, given the hidden-list game each battle came from. */
  label: (games: Readonly<Record<string, string>>) => (battle: Battle) => string
}) {
  const filter = battleFilterOf(search)
  const filtered = battleFilterActive(filter)
  const feed = useInfiniteQuery({ ...groupBattlesQuery(group.token, filter, order), placeholderData: keepPreviousData })
  const battles = battlesFrom(feed.data)
  const games = Object.assign({}, ...(feed.data?.pages.map((page) => page?.games) ?? [])) as Record<string, string>
  const members = group.members.filter((member) => member.status === 'accepted')
  return (
    <div className="space-y-4">
      {battles.length || filtered || order ? (
        <BattleFilters
          view="group"
          search={search}
          onChange={(next) => onChange(next, order)}
          order={order}
          onOrder={(next) => onChange(search, next)}
          signedIn={Boolean(viewerId)}
          updating={feed.isPlaceholderData}
          people={members.map((member) => ({ id: member.userId, name: member.name, image: member.image }))}
        />
      ) : null}
      <BattleFeedList
        name="Group battles"
        battles={battles}
        feed={feed}
        filtered={filtered}
        order={order}
        viewerId={viewerId ?? undefined}
        label={label(games)}
        empty={<p className="text-sm text-dim">No games yet. Members’ games show up here.</p>}
      />
    </div>
  )
}
