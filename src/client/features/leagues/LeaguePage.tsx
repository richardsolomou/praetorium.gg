import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { PageContent, PageHeader } from '../../components/Page'
import { leagueQuery, meQuery } from '../../queries'
import { LeaguePageActions, useLeagueActions } from './LeagueActions'
import { LeagueEventView } from './LeagueEventView'
import { EventSchedule } from './EventSchedule'
import { accessSummary, OrganizerLinks, VisibilityIcon } from './EventAccess'
import { eventName, leagueAllowances, leagueNoun, leaguePhase, leaguePlayers, type League } from './leagueEvent'
import { countLabel } from '../../text'
import { leagueFormat } from '../../../core/league'

export function LeaguePage({ token, startBattle, chooseRoster }: { token: string; startBattle?: boolean; chooseRoster?: boolean }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: league } = useQuery(leagueQuery(token))
  useEffect(() => {
    if (league === null) void navigate({ to: '/tournaments' })
  }, [league, navigate])
  if (!league) return null
  return <LeagueScreen league={league} token={token} viewerId={me?.id ?? null} startBattle={startBattle} chooseRoster={chooseRoster} />
}

function LeagueScreen({
  league,
  token,
  viewerId,
  startBattle,
  chooseRoster,
}: {
  league: League
  token: string
  viewerId: string | null
  startBattle?: boolean
  chooseRoster?: boolean
}) {
  const navigate = useNavigate()
  const { tournament } = league
  const isOrganizer = league.organizer
  // A tournament's owner alone deletes it; a club game goes with any of its club's organizers.
  const canDelete = tournament ? viewerId === tournament.ownerId : isOrganizer
  const actions = useLeagueActions(league, () =>
    league.club ? navigate({ to: '/clubs/$token', params: { token: league.club.token } }) : navigate({ to: '/tournaments' }),
  )
  const accepted = league.entries.filter((entry) => entry.status === 'accepted').length
  const phase = leaguePhase(league, accepted, league.occupiedCount)

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={leagueNoun(league).Noun}
        title={eventName(league)}
        actions={isOrganizer ? <LeaguePageActions actions={actions} canDelete={canDelete} /> : null}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`chip ${phase.tint}`}>{phase.label}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-dim">
            {[
              // A sealed game's title already says its format and points.
              league.club ? null : leagueFormat(league),
              league.rounds ? `Swiss, ${countLabel(league.rounds, 'round')}` : null,
              leagueAllowances(league),
              leaguePlayers(league, accepted),
            ]
              .filter(Boolean)
              .join(' · ')}
            {tournament ? (
              <>
                {' '}
                ·
                <VisibilityIcon visibility={tournament.visibility} />
                {accessSummary(tournament.visibility, tournament.admission)}
              </>
            ) : null}
          </span>
        </div>
        <EventSchedule event={league} className="mt-3" />
        {league.club ? (
          <p className="mt-3 flex flex-wrap gap-x-1.5 text-sm text-dim">
            <span>Part of</span>
            <Link to="/clubs/$token" params={{ token: league.club.token }} className="text-bone hover:underline">
              {league.club.name}
            </Link>
          </p>
        ) : null}
        {tournament?.description ? (
          <p className="mt-3 max-w-2xl font-rules text-sm whitespace-pre-wrap text-dim">{tournament.description}</p>
        ) : null}
        {tournament ? (
          <OrganizerLinks
            title="Organized by"
            organizers={[{ id: tournament.ownerId, name: tournament.ownerName, image: tournament.ownerImage }, ...tournament.admins]}
          />
        ) : null}
      </PageHeader>

      <PageContent>
        <LeagueEventView
          league={league}
          token={token}
          viewerId={viewerId}
          isOrganizer={isOrganizer}
          startBattle={startBattle}
          chooseRoster={chooseRoster}
        />
      </PageContent>
    </main>
  )
}
