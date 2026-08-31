import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { battlesFrom, battlesQuery, friendBattlesQuery, meQuery, publicBattlesQuery, standingsQuery } from '../../queries'
import { useLiveBattles } from '../../useLiveBattle'
import { CreateBattle } from '../battles/CreateBattle'
import { HomeView } from './HomeView'

/**
 * The home page, reading everything the route loader already put in the cache.
 *
 * Only this half knows there is a server. `HomeView` is handed its data and the
 * one control that mutates anything, so the page can be drawn from fixtures at
 * every width and state without a database behind it.
 */
export function Home() {
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const { data: mine } = useInfiniteQuery({ ...battlesQuery(), enabled: signedIn })
  const { data: friends } = useInfiniteQuery({ ...friendBattlesQuery(), enabled: signedIn })
  const { data: open, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(publicBattlesQuery())
  const { data: standings } = useQuery(standingsQuery())
  // Being added to a battle happens on someone else's device, so this page is told.
  useLiveBattles(signedIn)
  return (
    <HomeView
      me={me ?? null}
      mine={signedIn ? battlesFrom(mine) : []}
      friends={signedIn ? battlesFrom(friends) : []}
      open={battlesFrom(open)}
      standings={standings ?? null}
      newBattle={<CreateBattle />}
      more={hasNextPage ? { pending: isFetchingNextPage, onShow: () => void fetchNextPage() } : null}
    />
  )
}
