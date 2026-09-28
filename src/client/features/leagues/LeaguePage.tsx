import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Eye, LockKeyhole } from 'lucide-react'
import { useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContent, PageHeader } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { leagueQuery, meQuery } from '../../queries'
import { leagueRegistrationFull, leagueRosterSplit } from '../../../core/league'
import { TABLE_SHAPE_LABELS } from '../../../core/tableShape'
import { LeaguePageActions, useLeagueActions } from './LeagueActions'
import { LeagueConsole } from './LeagueConsole'
import { LeagueEventView } from './LeagueEventView'
import type { League } from './leagueEvent'

export type LeagueTab = 'organize' | 'event'

export function LeaguePage({
  token,
  eventToken,
  view,
  startBattle,
  chooseRoster,
}: {
  token: string
  eventToken?: string
  view?: LeagueTab
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
  return (
    <LeagueScreen
      league={league}
      token={token}
      viewerId={me?.id ?? null}
      view={view}
      startBattle={startBattle}
      chooseRoster={chooseRoster}
    />
  )
}

function LeagueScreen({
  league,
  token,
  viewerId,
  view,
  startBattle,
  chooseRoster,
}: {
  league: League
  token: string
  viewerId: string | null
  view?: LeagueTab
  startBattle?: boolean
  chooseRoster?: boolean
}) {
  const navigate = useNavigate()
  const isOwner = viewerId === league.ownerId
  const actions = useLeagueActions(league, () => navigate({ to: '/leagues' }))
  // The organizer runs the event from the console; a link that asks to seal or to play is a player's errand.
  const tab: LeagueTab = isOwner && view !== 'event' && !startBattle && !chooseRoster ? 'organize' : 'event'
  const accepted = league.entries.filter((entry) => entry.status === 'accepted').length
  const pending = league.entries.filter((entry) => entry.status === 'pending').length
  const latest = league.events[0]?.token === league.eventToken
  const phase = league.revealedAt
    ? 'Rosters revealed'
    : leagueRegistrationFull(league, accepted, league.occupiedCount)
      ? 'Registration full'
      : 'Registration open'
  const switchTab = (next: LeagueTab) =>
    void navigate({
      to: '/leagues/$token',
      params: { token },
      search: { ...(latest ? {} : { event: league.eventToken }), ...(next === 'event' ? { view: 'event' as const } : {}) },
    })

  const player = (
    <LeagueEventView
      league={league}
      token={token}
      viewerId={viewerId}
      isOwner={isOwner}
      startBattle={startBattle}
      chooseRoster={chooseRoster}
      onOrganize={() => switchTab('organize')}
    />
  )

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={
          latest
            ? league.eventCount > 1
              ? `League · Event ${league.eventNumber}`
              : 'League'
            : `League · Archived event ${league.eventNumber}`
        }
        title={league.name}
      >
        <div className="flex flex-wrap gap-2">
          <span className={`chip ${league.revealedAt ? 'text-achieved' : 'text-parchment'}`}>{phase}</span>
          {league.format && league.rosterLimit ? (
            <span className="chip">
              {TABLE_SHAPE_LABELS[league.format].name} ·{' '}
              {leagueRosterSplit(league.format, league.rosterLimit) ?? `${league.rosterLimit.toLocaleString()} points`}
            </span>
          ) : null}
          <span className="chip">
            {accepted}
            {league.playerLimit ? ` / ${league.playerLimit}` : ''} accepted
          </span>
          <span className="chip inline-flex items-center gap-1">
            {league.visibility === 'private' ? <LockKeyhole className="size-3" /> : <Eye className="size-3" />}
            {league.visibility === 'private' ? 'Private link' : 'Public'}
          </span>
          <span className="chip">{league.admission === 'approval' ? 'Approval required' : 'Automatic entry'}</span>
        </div>
        {league.description ? <p className="mt-3 max-w-2xl font-rules text-sm whitespace-pre-wrap text-dim">{league.description}</p> : null}
        <Link to="/users/$userId" params={{ userId: league.ownerId }} className="group mt-3 flex w-fit items-center gap-2 text-sm text-dim">
          <span>Organized by</span>
          <PlayerAvatar name={league.ownerName} image={league.ownerImage} className="size-7 text-3xs" />
          <span className="text-bone group-hover:underline">{league.ownerName}</span>
        </Link>
        {league.eventCount > 1 ? <EventSwitcher league={league} token={token} tab={tab} /> : null}
      </PageHeader>

      <PageContent>
        {isOwner ? (
          <Tabs value={tab} className="flex-col gap-0" onValueChange={(next) => switchTab(next as LeagueTab)}>
            {/* The league's own menu rides on the tab bar, the one row only its organizer sees. */}
            <div className="flex items-end gap-3 border-b border-edge">
              <TabsList data-onboarding="league-events" variant="line" className="h-auto flex-1 justify-start gap-5 p-0">
                {/* The primitive's own active underline is positioned by a variant this setup does not match, so it is stated here. */}
                <TabsTrigger value="organize" className={TAB}>
                  Organize
                  {!league.revealedAt && pending ? (
                    <span className="readout text-parchment" aria-label={`${pending} waiting`}>
                      {pending}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="event" className={TAB}>
                  Event
                </TabsTrigger>
              </TabsList>
              <div className="pb-1">
                <LeaguePageActions actions={actions} />
              </div>
            </div>
            <TabsContent value="organize" className="mt-4">
              <LeagueConsole league={league} token={token} actions={actions} onPlayerView={() => switchTab('event')} />
            </TabsContent>
            <TabsContent value="event" className="mt-4">
              {player}
            </TabsContent>
          </Tabs>
        ) : (
          player
        )}
      </PageContent>
    </main>
  )
}

const TAB =
  'rubric h-auto flex-none gap-2 rounded-none px-0 pb-2 after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-parchment hover:text-bone data-active:text-parchment data-active:after:opacity-100 pointer-coarse:min-h-11'

/** Every event the league has run, newest first, for a league that has run more than one. */
function EventSwitcher({ league, token, tab }: { league: League; token: string; tab: LeagueTab }) {
  const current = league.events[0]?.number
  return (
    <nav aria-label="League events" className="mt-4 flex flex-wrap items-center gap-1.5">
      {league.events.map((event) => {
        const selected = event.token === league.eventToken
        return (
          <Link
            key={event.token}
            to="/leagues/$token"
            params={{ token }}
            search={{ ...(event.number === current ? {} : { event: event.token }), ...(tab === 'event' ? { view: 'event' as const } : {}) }}
            aria-current={selected ? 'page' : undefined}
            className={`flex items-center gap-2 border px-2.5 py-1.5 text-xs pointer-coarse:min-h-11 ${selected ? 'border-parchment bg-raised text-bone' : 'border-edge bg-sunken text-dim hover:border-info'}`}
          >
            <span className="font-bold uppercase">Event {event.number}</span>
            <span>{event.revealedAt ? 'Revealed' : 'Open'}</span>
          </Link>
        )
      })}
    </nav>
  )
}
