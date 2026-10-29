import { useQuery } from '@tanstack/react-query'
import type { BattleView } from '../../../core/battleView'
import { RatingChange } from '../../components/RatingChange'
import { battleRatingChangesQuery } from '../../queries'

/**
 * How far the battle moved this player's leaderboard rating, beside their name once it
 * is over. Nothing while it is being played or replayed short of the end, or when the
 * leaderboard does not count it.
 */
export function PlayerRatingChange({ view, playerId }: { view: BattleView; playerId: string }) {
  const finished = view.status === 'finished'
  const { data: changes } = useQuery({ ...battleRatingChangesQuery(view.token), enabled: finished })
  const change = finished ? changes?.[playerId] : undefined
  return change === undefined ? null : <RatingChange change={change} />
}
