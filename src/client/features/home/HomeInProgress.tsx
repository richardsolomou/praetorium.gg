import { Link } from '@tanstack/react-router'
import { ChevronRight, FileDiff, Hourglass, Layers, ScrollText, Swords, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionHeading } from '../../components/SectionHeading'
import { useMoment } from '../../dates'
import { countLabel } from '../../text'
import type { Battle } from '../battles/battle'
import { BattleShelf } from '../battles/BattleShelf'
import { BattleLines } from '../battles/BattleLines'
import { useBattleDetail } from './HomeFeed'
import { eventFullName, eventLink } from '../sealedEvents/sealedEvent'

/** An event that has accepted the player and is still waiting for their list. */
export type RosterDue = Parameters<typeof eventFullName>[0] & Parameters<typeof eventLink>[0]

/** A league game in one of the player's groups that nobody has started yet. */
export type LeagueGameDue = {
  groupToken: string
  groupName: string
  round: number
  opponent: string
  deadline: number | null
  overdue: boolean
}

/** How many games in progress the section shows, the first as a plate and the rest as rows, before its link to the rest. */
const GAMES_SHOWN = 2

/**
 * Everything waiting on the player, most pressing first: games they are in the middle of, the latest as a plate, then league
 * games past their deadline, lists an event needs, league games still to play, games left untouched, lists a data update
 * changed, and friend requests.
 */
export function HomeInProgress({
  games,
  staleGames,
  viewerId,
  onDelete,
  rostersDue,
  leagueGames,
  changedRosters,
  friendRequests,
}: {
  games: readonly Battle[]
  /** Unfinished games untouched long enough to leave the cards, still waiting to be finished on the battles page. */
  staleGames: number
  viewerId: string
  onDelete?: (battle: Battle) => void
  rostersDue: readonly RosterDue[]
  leagueGames: readonly LeagueGameDue[]
  changedRosters: number
  friendRequests: number
}) {
  const moment = useMoment()
  const detail = useBattleDetail()
  // A game being played leads over one still being set up, whichever was touched last.
  const lead = games.find((game) => game.status === 'playing') ?? games[0]
  const others = games.filter((game) => game !== lead)
  const moreGames = Math.max(0, games.length - GAMES_SHOWN)
  const errands = rostersDue.length + leagueGames.length + (staleGames ? 1 : 0) + (changedRosters ? 1 : 0) + (friendRequests ? 1 : 0)
  if (!games.length && !errands) return null
  const league = (game: LeagueGameDue) => (
    <li key={`${game.groupToken}-${game.round}`}>
      <Link to="/groups/$token" params={{ token: game.groupToken }} search={{ tab: 'league' }} className={ROW}>
        <Row
          icon={<Swords className={`size-4 ${game.overdue ? 'text-discarded' : 'text-parchment'}`} aria-hidden />}
          detail={
            <>
              {/* Overdue leads, so a narrow row truncates the group's name rather than the warning. */}
              {game.overdue ? <span className="font-semibold text-discarded">Overdue · </span> : null}
              {game.groupName} · Round {game.round}
              {!game.overdue && game.deadline !== null ? ` · due ${moment(game.deadline)}` : null}
            </>
          }
        >
          League game against <span className="font-bold text-bone">{game.opponent}</span>
        </Row>
      </Link>
    </li>
  )
  return (
    <section data-home-in-progress>
      <SectionHeading title="In progress" count={games.length + errands} />
      {/* The games after the first, then the tasks, run on as one list of hairline rows under the plate. */}
      <div className="space-y-3">
        {lead ? <BattleShelf name="Your games" lead battles={[lead]} viewerId={viewerId} onDelete={onDelete} /> : null}
        <div>
          {others.length ? (
            <div data-battle-shelf="Your other games">
              <BattleLines battles={others.slice(0, GAMES_SHOWN - 1)} detail={detail} viewerId={viewerId} />
              {moreGames ? (
                <Link to="/battles" className={`border-b border-edge ${ROW}`}>
                  <Row icon={<Layers className="size-4 text-parchment" aria-hidden />} detail="On your battles page">
                    {countLabel(moreGames, 'more game')} in progress
                  </Row>
                </Link>
              ) : null}
            </div>
          ) : null}
          {errands ? (
            <ul className={`divide-y divide-edge border-b border-edge ${others.length ? '' : 'border-t'}`}>
              {leagueGames.filter((game) => game.overdue).map(league)}
              {rostersDue.map((sealedEvent) => (
                <li key={sealedEvent.token}>
                  <Link {...eventLink(sealedEvent)} className={ROW}>
                    <Row icon={<ScrollText className="size-4 text-discarded" aria-hidden />}>
                      <span className="font-bold text-bone">{eventFullName(sealedEvent)}</span> needs your roster
                    </Row>
                  </Link>
                </li>
              ))}
              {leagueGames.filter((game) => !game.overdue).map(league)}
              {staleGames ? (
                <li>
                  <Link to="/battles" className={ROW}>
                    <Row icon={<Hourglass className="size-4 text-discarded" aria-hidden />} detail="Untouched for two weeks or more">
                      {countLabel(staleGames, 'unfinished game')} waiting
                    </Row>
                  </Link>
                </li>
              ) : null}
              {changedRosters ? (
                <li>
                  <Link to="/rosters" search={{ updates: 'changed' }} className={ROW}>
                    <Row
                      icon={<FileDiff className="size-4 text-discarded" aria-hidden />}
                      detail="Check their points and options still hold"
                    >
                      {countLabel(changedRosters, 'list')} changed in a data update
                    </Row>
                  </Link>
                </li>
              ) : null}
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
          ) : null}
        </div>
      </div>
    </section>
  )
}

const ROW = 'group flex min-h-13 items-center gap-3 px-2 py-2.5 transition-colors hover:bg-raised'

function Row({ icon, detail, children }: { icon: ReactNode; detail?: ReactNode; children: ReactNode }) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm break-words text-bone/85">{children}</span>
        {detail ? <span className="block truncate text-xs text-dim">{detail}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-dim group-hover:text-parchment" aria-hidden />
    </>
  )
}
