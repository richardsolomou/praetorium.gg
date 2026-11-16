import { Link } from '@tanstack/react-router'
import { ChevronRight, Trophy, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { ShelfLink } from '../../components/ShelfLink'
import { SectionHeading } from '../../components/SectionHeading'
import { useDateFormatting, useMoment } from '../../dates'
import { countLabel } from '../../text'
import { HOME_GROUPS_SHOWN } from '../../../core/group'

/** A group the player belongs to or has asked to join. */
export type HomeGroup = {
  token: string
  name: string
  battles: number
  lastBattleAt: number | null
  pending: boolean
  /** The player's place on the group's table once they have played enough to be placed; absent while it loads. */
  place?: { place: number; of: number } | null
}

/** A tournament the player has entered that is still ahead of them or being played. */
export type HomeTournament = { token: string; name: string; playsAt: number | null; status: { label: string; tint: string } }

/** How many of the panel's lines tournaments may take while there are groups to show too. */
const TOURNAMENTS_SHOWN = 3

/** Where the player plays organised games, one line each, with how lively each group is and where each tournament entry stands. */
export function HomeGroups({ groups, tournaments }: { groups: readonly HomeGroup[]; tournaments: readonly HomeTournament[] }) {
  const { date } = useDateFormatting()
  const moment = useMoment()
  if (!groups.length && !tournaments.length) return null
  const shownTournaments = tournaments.slice(0, groups.length ? TOURNAMENTS_SHOWN : HOME_GROUPS_SHOWN)
  const shownGroups = groups.slice(0, HOME_GROUPS_SHOWN - shownTournaments.length)
  return (
    <section data-home-groups>
      <SectionHeading title="Your events" />
      <ul className="part divide-y divide-edge overflow-hidden">
        {shownTournaments.map((tournament) => (
          <li key={tournament.token}>
            <Link to="/tournaments/$token" params={{ token: tournament.token }} className={ROW}>
              <Row icon={<Trophy className="size-4 text-parchment" aria-hidden />} name={tournament.name}>
                <span className={`font-semibold ${tournament.status.tint}`}>{tournament.status.label}</span>
                {tournament.playsAt === null ? null : ` · Played ${moment(tournament.playsAt)}`}
              </Row>
            </Link>
          </li>
        ))}
        {shownGroups.map((group) => (
          <li key={group.token}>
            <Link to="/groups/$token" params={{ token: group.token }} className={ROW}>
              <Row icon={<Users className="size-4 text-parchment" aria-hidden />} name={group.name}>
                {group.pending ? (
                  <span className="font-semibold text-discarded">Request sent</span>
                ) : (
                  <>
                    {group.place ? (
                      <span className="font-semibold text-bone">
                        #{group.place.place} of {group.place.of} ·{' '}
                      </span>
                    ) : null}
                    {countLabel(group.battles, 'game')}
                    {group.lastBattleAt ? ` · last ${date(group.lastBattleAt)}` : ''}
                  </>
                )}
              </Row>
            </Link>
          </li>
        ))}
      </ul>
      {groups.length > shownGroups.length || tournaments.length > shownTournaments.length ? (
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {groups.length ? <ShelfLink to="/groups">All my groups</ShelfLink> : null}
          {tournaments.length ? <ShelfLink to="/tournaments">All my tournaments</ShelfLink> : null}
        </p>
      ) : null}
    </section>
  )
}

const ROW = 'group flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised'

function Row({ icon, name, children }: { icon: ReactNode; name: string; children: ReactNode }) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-bold">{name}</span>
        <span className="block truncate text-xs text-dim">{children}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-dim group-hover:text-parchment" aria-hidden />
    </>
  )
}
