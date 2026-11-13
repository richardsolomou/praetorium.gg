import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import type { BattleView } from '../../../core/battleView'
import { isGuestSeat, isPracticeSeat } from '../../../core/newBattle'
import { friendshipsQuery, playerProfileQuery } from '../../queries'
import { FriendAction } from '../friends/FriendAction'
import { recordSummary } from '../profile/recordSummary'
import { tint } from './battleTints'

/**
 * Where a seated account now stands against the person they played, and the step towards being friends with the
 * people at the table, in one quiet panel showing only the parts that apply.
 */
export function AfterBattle({ view }: { view: BattleView }) {
  const viewer = view.players.find((player) => player.isViewer)
  const others = view.players.filter((player) => player !== viewer)
  const accounts = others.filter((player) => !isGuestSeat(player.id) && !isPracticeSeat(player))
  const opponents = others.filter((player) => player.side !== viewer?.side)
  // A practice seat keeps the whole battle out of the record, so it has no standing to show.
  const rival = opponents.length === 1 && accounts.includes(opponents[0]!) && !view.players.some(isPracticeSeat) ? opponents[0]! : null
  const seated = viewer !== undefined && !isGuestSeat(viewer.id)
  const friendships = useQuery({ ...friendshipsQuery(), enabled: seated && accounts.length > 0 })
  const profile = useQuery({ ...playerProfileQuery(view.viewerId), enabled: seated && rival !== null })
  if (!seated) return null
  const strangers = friendships.data ? accounts.filter((person) => !friendships.data.friends.some(({ id }) => id === person.id)) : []
  const against = rival ? profile.data?.record.opponents.find(({ id }) => id === rival.id) : undefined
  const recording = rival !== null && (profile.isPending || against !== undefined)
  if (!recording && !strangers.length) return null

  return (
    <aside data-after-battle aria-label="After the battle" className="flex flex-wrap items-center gap-3 part p-4">
      <div className="min-w-0 flex-1 basis-60 space-y-0.5">
        {recording && !against ? (
          <Skeleton className="h-5 w-56" />
        ) : rival && against ? (
          <p className="text-sm font-semibold text-bone">
            {against.battles > 1 ? (
              <>
                Against <span className={tint(rival.side).text}>{rival.name}</span>: {recordSummary(against)}
              </>
            ) : (
              <>
                Your first battle against <span className={tint(rival.side).text}>{rival.name}</span>.
              </>
            )}{' '}
            <Link
              to="/users/$userId"
              params={{ userId: view.viewerId }}
              search={{ opponentId: rival.id }}
              className="font-normal whitespace-nowrap text-info hover:text-bone"
            >
              Your record
            </Link>
          </p>
        ) : null}
        {strangers.length ? <p className="text-xs text-dim">Once you are friends, you can start battles with each other.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 max-sm:[&>button]:h-11">
        {strangers.map((person) => (
          <FriendAction key={person.id} person={person} event="battle_friend_requested" />
        ))}
      </div>
    </aside>
  )
}
