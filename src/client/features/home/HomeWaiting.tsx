import { Link } from '@tanstack/react-router'
import { ChevronRight, ScrollText, ShieldAlert, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { HomeRoster } from './HomeRosters'
import { rosterTitle } from '../rosters/RosterSummary'

/** A league event that has accepted the player and is still waiting for their list. */
export type RosterDue = { token: string; name: string }

/**
 * Everything outside a live game that cannot move until this player does.
 *
 * These are the same few things a phone is notified about, gathered where a
 * player who ignored the notification will still find them. A list a data update
 * has made unfieldable belongs here too: it is the one the player finds out about
 * at the table otherwise. The section is absent when nothing is waiting, because
 * "nothing to do" is not worth the space above the player's own lists.
 */
export function HomeWaiting({
  rostersDue,
  friendRequests,
  rosters,
}: {
  rostersDue: readonly RosterDue[]
  friendRequests: number
  rosters: readonly HomeRoster[]
}) {
  const broken = rosters.filter((entry) => entry.problem)
  const unnamed = broken.length - BROKEN_NAMED
  if (!rostersDue.length && !friendRequests && !broken.length) return null
  return (
    <section data-home-waiting>
      <p className="rubric flex items-baseline justify-between border-b border-discarded/40 pb-2 text-discarded">
        <span>Waiting on you</span>
        <span className="readout">{rostersDue.length + friendRequests + broken.length}</span>
      </p>
      <ul className="divide-y divide-edge border-b border-edge">
        {rostersDue.map((league) => (
          <li key={league.token}>
            <Link to="/leagues/$token" params={{ token: league.token }} className={ROW}>
              <Row icon={<ScrollText className="size-4 text-parchment" aria-hidden />}>
                <span className="font-bold uppercase">{league.name}</span> needs your roster
              </Row>
            </Link>
          </li>
        ))}
        {friendRequests ? (
          <li>
            <Link to="/friends" className={ROW}>
              <Row icon={<UserPlus className="size-4 text-parchment" aria-hidden />}>
                {friendRequests === 1 ? 'A player wants to be your friend' : `${friendRequests} players want to be your friend`}
              </Row>
            </Link>
          </li>
        ) : null}
        {broken.slice(0, BROKEN_NAMED).map(({ roster, faction, label, problem }) => (
          <li key={roster.id}>
            <Link to="/rosters/$id/edit" params={{ id: roster.id }} className={ROW}>
              <Row icon={<ShieldAlert className="size-4 text-discarded" aria-hidden />}>
                <span className="font-bold uppercase">{rosterTitle(roster, faction, label)}</span>{' '}
                {problem === 'over-limit' ? 'is over its points limit' : 'is not legal'}
              </Row>
            </Link>
          </li>
        ))}
        {unnamed > 0 ? (
          <li>
            <Link to="/rosters" className={ROW}>
              <Row icon={<ShieldAlert className="size-4 text-discarded" aria-hidden />}>
                {unnamed === 1 ? '1 more list is over its limit or not legal' : `${unnamed} more lists are over their limit or not legal`}
              </Row>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  )
}

/** Lists named one by one before the rest are counted; a player with many broken lists has a library to open. */
const BROKEN_NAMED = 3

const ROW = 'group -mx-3 flex items-center gap-3 px-3 py-3 hover:bg-raised'

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1 text-sm break-words text-dim">{children}</span>
      <ChevronRight className="size-4 shrink-0 text-info group-hover:text-parchment" aria-hidden />
    </>
  )
}
