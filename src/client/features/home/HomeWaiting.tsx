import { Link } from '@tanstack/react-router'
import { ChevronRight, ScrollText, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'

/** A league event that has accepted the player and is still waiting for their list. */
export type RosterDue = { token: string; name: string }

/**
 * Everything outside a live game that cannot move until this player does.
 *
 * These are the same few things a phone is notified about, gathered where a
 * player who ignored the notification will still find them. The section is absent when nothing needs a response.
 */
export function HomeWaiting({ rostersDue, friendRequests }: { rostersDue: readonly RosterDue[]; friendRequests: number }) {
  if (!rostersDue.length && !friendRequests) return null
  return (
    <section data-home-waiting>
      <p className="rubric flex items-baseline justify-between border-b border-discarded/40 pb-2 text-discarded">
        <span>Needs your attention</span>
        <span className="readout">{rostersDue.length + friendRequests}</span>
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
      </ul>
    </section>
  )
}

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
