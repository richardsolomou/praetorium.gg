import { useQuery } from '@tanstack/react-query'
import { meQuery, onboardingQuery } from '../../queries'

/** What tracking a game here does that paper at the table does not, said where a battle starts. */
export const TRACKER_PITCH =
  'Praetorium adds your CP each Command phase, greys out the stratagems you can’t use and says why, and asks what each card scored. A game against a friend goes on your record, with a replay of every turn.'

/**
 * Whether the player has yet to sit at a battle here, so has not seen what the tracker does.
 * False until their progress arrives, so a player with games behind them never sees the pitch flash in.
 */
export function useFirstBattle() {
  const { data: me } = useQuery(meQuery())
  const { data: progress } = useQuery({ ...onboardingQuery(), enabled: Boolean(me) })
  return Boolean(me && progress && !progress.completedTasks.includes('battle'))
}
