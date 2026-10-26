import { isTeamFormat } from '../../../core/league'
import { useQuery } from '@tanstack/react-query'
import { eventFullName, eventLink } from '../leagues/leagueEvent'
import { Link } from '@tanstack/react-router'
import { FileLock2 } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import { leaguesQuery } from '../../queries'

/** The way back to every event still waiting for a list of this size, so a list built for one can be sealed there. */
export function DueLeagueRosters({ limit, pointsBudget, saved }: { limit: number; pointsBudget: number | null; saved: boolean }) {
  const { data: leagues = [] } = useQuery(leaguesQuery())
  if (!saved) return null
  // A duel takes lists at its size and points total; a team event, once it seats the player, any list no bigger than its size.
  const fits = (league: (typeof leagues)[number], required: number) =>
    isTeamFormat(league.format)
      ? league.rosterLimit !== null && limit <= league.rosterLimit
      : required === limit && pointsBudget === (league.pointsBudget ?? null)
  const due = leagues.filter(
    (league) =>
      !league.revealedAt &&
      league.ownEntry?.status === 'accepted' &&
      !league.ownEntry.submitted &&
      (league.ownEntry.requiredLimit === null
        ? league.format === null && pointsBudget === null
        : fits(league, league.ownEntry.requiredLimit)),
  )
  return due.map((league) => (
    <Link
      key={league.token}
      {...eventLink(league, { choose: true })}
      className={buttonClass({ variant: 'ghost', size: 'xs', className: 'max-w-48 text-parchment' })}
    >
      <FileLock2 className="size-4" aria-hidden />
      <span className="truncate">Seal for {eventFullName(league)}</span>
    </Link>
  ))
}
