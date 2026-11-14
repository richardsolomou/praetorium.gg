import { useInfiniteQuery } from '@tanstack/react-query'
import type { BattleFilter } from '../../../../core/battleFilter'
import { ShelfLink } from '../../../components/ShelfLink'
import { battlesFrom, publicBattlesQuery } from '../../../queries'
import { BattleShelf } from '../../battles/BattleShelf'

const SHOWN = 3

/**
 * A few finished public games that fielded this faction, so a reader who arrived from search sees what a tracked game looks like.
 *
 * The battles page asks for the same filter, so its link reuses the answer. With no such games the shelf is left out rather than shown empty.
 */
export function FactionGames({ faction }: { faction: { slug: string; displayName: string } }) {
  const filter: BattleFilter = { status: { in: ['finished'], out: [] }, faction: { in: [faction.slug], out: [] } }
  const { data } = useInfiniteQuery(publicBattlesQuery(filter))
  const battles = battlesFrom(data).slice(0, SHOWN)
  if (!battles.length) return null
  return (
    <div>
      <BattleShelf title={`Recent ${faction.displayName} games`} battles={battles} />
      <ShelfLink to="/battles" search={{ view: 'public', status: 'finished', faction: faction.slug }} className="mt-2">
        All {faction.displayName} games
      </ShelfLink>
    </div>
  )
}
