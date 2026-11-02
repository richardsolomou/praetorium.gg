import { Link } from '@tanstack/react-router'
import { eventFullName, eventLink } from '../sealedEvents/sealedEvent'
import { ChevronRight, ScrollText, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionHeading } from '../../components/SectionHeading'

/** An event that has accepted the player and is still waiting for their list. */
export type RosterDue = Parameters<typeof eventFullName>[0] & Parameters<typeof eventLink>[0]

/** Friend requests and accepted event entries still awaiting this player's roster. */
export function HomeWaiting({ rostersDue, friendRequests }: { rostersDue: readonly RosterDue[]; friendRequests: number }) {
  if (!rostersDue.length && !friendRequests) return null
  return (
    <section data-home-waiting>
      <SectionHeading title="Needs your attention" count={rostersDue.length + friendRequests} className="text-discarded" />
      <ul className="part divide-y divide-edge overflow-hidden">
        {rostersDue.map((sealedEvent) => (
          <li key={sealedEvent.token}>
            <Link {...eventLink(sealedEvent)} className={ROW}>
              <Row icon={<ScrollText className="size-4 text-discarded" aria-hidden />}>
                <span className="font-bold text-bone">{eventFullName(sealedEvent)}</span> needs your roster
              </Row>
            </Link>
          </li>
        ))}
        {friendRequests ? (
          <li>
            <Link to="/friends" className={ROW}>
              <Row icon={<UserPlus className="size-4 text-discarded" aria-hidden />}>
                {friendRequests === 1 ? 'A player wants to be your friend' : `${friendRequests} players want to be your friend`}
              </Row>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  )
}

const ROW = 'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised'

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1 text-sm break-words text-bone/85">{children}</span>
      <ChevronRight className="size-4 shrink-0 text-dim group-hover:text-parchment" aria-hidden />
    </>
  )
}
