import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Eye, LockKeyhole } from 'lucide-react'
import { useEffect } from 'react'
import { PageContent, PageHeader } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { leagueQuery, meQuery } from '../../queries'
import { isLeagueOrganizer } from '../../../core/league'
import { LeaguePageActions, useLeagueActions } from './LeagueActions'
import { LeagueEventView } from './LeagueEventView'
import { EventSchedule } from './EventSchedule'
import { eventName, leagueAllowances, leagueFormat, leagueNoun, leaguePhase, leaguePlayers, type League } from './leagueEvent'

export function LeaguePage({
  token,
  eventToken,
  startBattle,
  chooseRoster,
}: {
  token: string
  eventToken?: string
  startBattle?: boolean
  chooseRoster?: boolean
}) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: league } = useQuery(leagueQuery(token, eventToken))
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
  const isOwner = viewerId === league.ownerId
  const isOrganizer = isLeagueOrganizer(
    league,
    league.admins.map((admin) => admin.id),
    viewerId,
  )
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
        actions={isOrganizer ? <LeaguePageActions actions={actions} canDelete={isOwner} /> : null}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`chip ${phase.tint}`}>{phase.label}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-dim">
            {[
              leagueFormat(league),
              league.rounds ? `Swiss, ${league.rounds} ${league.rounds === 1 ? 'round' : 'rounds'}` : null,
              leagueAllowances(league),
              leaguePlayers(league, accepted),
            ]
              .filter(Boolean)
              .join(' · ')}{' '}
            ·{league.visibility === 'private' ? <LockKeyhole className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {league.visibility === 'private' ? 'Private link' : 'Public'} ·{' '}
            {league.admission === 'approval' ? 'Approval required' : 'Anyone can join'}
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
        {league.description ? <p className="mt-3 max-w-2xl font-rules text-sm whitespace-pre-wrap text-dim">{league.description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dim">
          <span>Organized by</span>
          {[{ id: league.ownerId, name: league.ownerName, image: league.ownerImage }, ...league.admins].map((organizer) => (
            <Link key={organizer.id} to="/users/$userId" params={{ userId: organizer.id }} className="group flex w-fit items-center gap-2">
              <PlayerAvatar name={organizer.name} image={organizer.image} className="size-7 text-3xs" />
              <span className="text-bone group-hover:underline">{organizer.name}</span>
            </Link>
          ))}
        </div>
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
