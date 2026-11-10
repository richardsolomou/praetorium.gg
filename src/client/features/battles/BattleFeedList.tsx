import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { BattleOrder } from '../../../core/battleFilter'
import { NoFilterMatches } from '../../components/NoFilterMatches'
import type { Battle } from './battle'
import { BattleShelf } from './BattleShelf'

type Feed = { hasNextPage: boolean; isFetchingNextPage: boolean; isPending: boolean; fetchNextPage: () => unknown }

/** The next page of a battle feed; a filtered feed walks a bounded stretch per page, so it says it searches further. */
export function MoreBattles({ feed, filtered, order }: { feed: Feed; filtered: boolean; order?: BattleOrder }) {
  if (!feed.hasNextPage) return null
  return (
    <Button variant="outline" size="sm" className="mt-2" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
      {feed.isFetchingNextPage ? 'Loading…' : filtered ? (order ? 'Search newer battles' : 'Search older battles') : 'Show more battles'}
    </Button>
  )
}

/** One filtered battle feed as a single shelf, for a page whose battles are one section of it rather than the whole page. */
export function BattleFeedList({
  name,
  battles,
  feed,
  filtered,
  order,
  viewerId,
  label,
  empty,
}: {
  name: string
  battles: readonly Battle[]
  feed: Feed
  filtered: boolean
  order?: BattleOrder
  viewerId?: string
  label?: (battle: Battle) => string
  /** What an unfiltered feed with no battles says. */
  empty: ReactNode
}) {
  const more = <MoreBattles feed={feed} filtered={filtered} order={order} />
  if (feed.isPending) return <BattlesSkeleton />
  if (!battles.length)
    return filtered ? (
      <div>
        <NoFilterMatches>
          {feed.hasNextPage ? 'None of the battles searched so far match.' : 'No battles match these filters.'}
        </NoFilterMatches>
        {more}
      </div>
    ) : (
      empty
    )
  return (
    <div>
      <BattleShelf name={name} battles={battles} viewerId={viewerId} label={label} />
      {more}
    </div>
  )
}

function BattlesSkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading battles">
      <Skeleton className="h-4 w-20" />
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="flex min-h-20 items-center gap-3 part p-3" aria-hidden>
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}
