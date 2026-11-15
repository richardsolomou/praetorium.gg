import { useQuery } from '@tanstack/react-query'
import { meQuery, onboardingQuery } from '../../queries'
import { useHydrated } from '../../useClientValue'

/** What tracking a game here does that paper at the table does not, said where a battle starts. */
export const TRACKER_PITCH =
  'Praetorium adds your CP each Command phase, greys out the stratagems you can’t use and says why, reminds you of abilities in the phase they apply to, and asks what each card scored. A game against a friend goes on your record, with a replay of every turn.'

/** The same promise in one line, under a legal roster's Start a battle. */
export const TRACKER_HINT = 'Adds your CP, checks stratagems, asks what each card scored and keeps a replay.'

/**
 * Whether the player has yet to sit at a battle here, so has not seen what the tracker does.
 * False until their progress arrives, so a player with games behind them never sees the hint flash in,
 * and while hydrating, because the restored offline cache can hold progress the server render lacked.
 */
export function useFirstBattle() {
  const hydrated = useHydrated()
  const { data: me } = useQuery(meQuery())
  const { data: progress } = useQuery({ ...onboardingQuery(), enabled: Boolean(me) })
  return Boolean(hydrated && me && progress && !progress.completedTasks.includes('battle'))
}
