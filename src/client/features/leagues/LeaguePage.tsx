import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, Eye, LockKeyhole } from 'lucide-react'
import { useEffect } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageContent, PageHeader } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { leagueQuery, meQuery } from '../../queries'
import { isLeagueOrganizer } from '../../../core/league'
import { LeaguePageActions, useLeagueActions } from './LeagueActions'
import { LeagueEventView } from './LeagueEventView'
import { leagueAllowances, leagueFormat, leaguePhase, leaguePlayers, type League } from './leagueEvent'

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
    if (league === null) void navigate({ to: '/leagues' })
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
  const actions = useLeagueActions(league, () => navigate({ to: '/leagues' }))
  const accepted = league.entries.filter((entry) => entry.status === 'accepted').length
  const latest = league.events[0]?.token === league.eventToken
  const phase = leaguePhase(league, accepted, league.occupiedCount)

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={league.eventCount > 1 ? <EventPicker league={league} token={token} latest={latest} /> : 'League'}
        title={league.name}
        actions={isOrganizer ? <LeaguePageActions actions={actions} canDelete={isOwner} /> : null}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`chip ${phase.tint}`}>{phase.label}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-dim">
            {[leagueFormat(league), leagueAllowances(league), leaguePlayers(league, accepted)].filter(Boolean).join(' · ')} ·
            {league.visibility === 'private' ? <LockKeyhole className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {league.visibility === 'private' ? 'Private link' : 'Public'} ·{' '}
            {league.admission === 'approval' ? 'Approval required' : 'Anyone can join'}
          </span>
        </div>
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

/** Which of the league's events the page shows, as one line however many it has run. */
function EventPicker({ league, token, latest }: { league: League; token: string; latest: boolean }) {
  const current = league.events[0]?.number
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`League events, showing event ${league.eventNumber}`}
            className="inline-flex items-center gap-1 uppercase hover:text-bone pointer-coarse:min-h-11"
          />
        }
      >
        League · {latest ? `Event ${league.eventNumber}` : `Past event ${league.eventNumber}`}
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        {league.events.map((event) => {
          const selected = event.token === league.eventToken
          return (
            <DropdownMenuItem
              key={event.token}
              aria-current={selected ? 'page' : undefined}
              render={<Link to="/leagues/$token" params={{ token }} search={event.number === current ? {} : { event: event.token }} />}
            >
              <span className={`font-bold uppercase ${selected ? 'text-parchment' : ''}`}>Event {event.number}</span>
              <span className="ml-auto text-xs text-dim">{event.revealedAt ? 'Revealed' : 'Open'}</span>
            </DropdownMenuItem>
          )
        })}
        {league.eventCount > league.events.length ? (
          <p className="px-2 py-1.5 text-xs text-dim">
            Showing the latest {league.events.length} of {league.eventCount} events.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
