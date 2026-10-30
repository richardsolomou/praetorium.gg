import { VisibilityIcon } from './EventAccess'
import { SectionHeading } from '../../components/SectionHeading'
import { GuideHelp } from '../onboarding/GuideHelp'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BookOpen, Users } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import { isLeagueOrganizer } from '../../../core/league'
import { leaguesQuery, meQuery, type QueryData } from '../../queries'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { CreateLeague } from './CreateLeague'
import { EventSchedule } from './EventSchedule'
import { LEAGUE_CARD, LeagueCardActions } from './LeagueActions'
import { leaguePhase, leaguePlayers } from './leagueEvent'
import { leagueFormat } from '../../../core/league'

export function LeagueIndex() {
  const { data: me } = useQuery(meQuery())
  const { data: all = [] } = useQuery(leaguesQuery())
  // A club's sealed games are reached from its club page; the list keeps them for rosters due and offline saves.
  const leagues = all.flatMap(({ tournament, ...league }) => (tournament ? [{ ...league, tournament }] : []))
  const mine = leagues.filter((league) => league.personal)
  const publicLeagues = leagues.filter((league) => league.tournament.visibility === 'public' && !mine.includes(league))

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Events"
        title="Tournaments"
        description="One-off events. Everyone seals a list in secret, then the lists are revealed together."
        actions={
          <>
            {me ? <GuideHelp task="league">Tournament guide</GuideHelp> : null}
            <SampleLink />
            {me ? <CreateLeague /> : null}
          </>
        }
      />
      <PageContent className="space-y-6">
        {mine.length ? <LeagueShelf title="Your tournaments" leagues={mine} viewerId={me?.id ?? null} /> : null}
        {publicLeagues.length ? <LeagueShelf title="Public tournaments" leagues={publicLeagues} viewerId={me?.id ?? null} /> : null}
        {!leagues.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Sealed rosters"
            title="No tournaments yet"
            explanation={me ? 'Create one and send the link to your group.' : 'Public tournaments will appear here. Sign in to create one.'}
            icon={Users}
            action={<SampleLink />}
          />
        ) : null}
      </PageContent>
    </main>
  )
}

function SampleLink() {
  return (
    <Link to="/tournaments/sample" className={buttonClass({ variant: 'outline' })}>
      <BookOpen /> See a sample
    </Link>
  )
}

function LeagueShelf({
  title,
  leagues,
  viewerId,
}: {
  title: string
  leagues: (TournamentSummary & { tournament: NonNullable<TournamentSummary['tournament']> })[]
  viewerId: string | null
}) {
  return (
    <section>
      <SectionHeading title={title} count={leagues.length} />
      <div className="grid gap-3 md:grid-cols-2">
        {leagues.map((league) => {
          const { tournament } = league
          const organizer = isLeagueOrganizer(tournament, tournament.adminIds, viewerId)
          // One status: the reader's own place when they have one, otherwise where the tournament stands.
          const status = league.ownEntry
            ? ownEntryStatus(league.ownEntry, Boolean(league.revealedAt))
            : leaguePhase(league, league.entrantCount, league.occupiedCount)
          const format = leagueFormat(league)
          const card = (
            <Link to="/tournaments/$token" params={{ token: league.token }} className="flex min-w-0 flex-1 flex-col">
              <div className={`flex-1 p-4 ${organizer ? 'pr-12' : ''}`}>
                <p className="flex items-center gap-2 text-xs text-dim">
                  <VisibilityIcon visibility={tournament.visibility} labelled />
                  <span className="truncate tracking-label uppercase">{format ?? 'Any format'}</span>
                </p>
                <h3 className="mt-1.5 truncate text-lg leading-tight font-bold uppercase">{tournament.name}</h3>
                <EventSchedule event={league} className="mt-1 text-xs" />
                {tournament.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-dim">{tournament.description}</p>
                ) : (
                  <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-dim">
                    <PlayerAvatar name={tournament.ownerName} image={tournament.ownerImage} className="size-5 text-3xs" />
                    <span className="truncate">Organized by {tournament.ownerName}</span>
                  </p>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-3 border-t border-edge bg-sunken/60 px-4 py-2.5 text-sm">
                <span className={`flex min-w-0 items-center gap-2 font-semibold ${status.tint}`}>
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
                  <span className="truncate">{status.label}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs text-dim">{leaguePlayers(league, league.entrantCount)}</span>
              </div>
            </Link>
          )
          if (!organizer) {
            return (
              <article key={league.token} data-league={league.token} className={LEAGUE_CARD}>
                {card}
              </article>
            )
          }
          return (
            <LeagueCardActions key={league.token} league={league} canDelete={tournament.ownerId === viewerId}>
              {(menu) => (
                <>
                  {card}
                  <div className="absolute top-2 right-2">{menu}</div>
                </>
              )}
            </LeagueCardActions>
          )
        })}
      </div>
    </section>
  )
}

type TournamentSummary = QueryData<typeof leaguesQuery>[number]

/** Where the reader's own entry stands, tinted by whether it needs them: amber to act, green once done. */
function ownEntryStatus(entry: { status: 'pending' | 'accepted' | 'rejected'; submitted: boolean }, revealed: boolean) {
  if (entry.status === 'pending') return { label: 'Waiting for approval', tint: 'text-dim' }
  if (entry.status === 'rejected') return { label: 'Not in this tournament', tint: 'text-faint' }
  if (entry.submitted)
    return revealed ? { label: 'Rosters revealed', tint: 'text-achieved' } : { label: 'Your roster is sealed', tint: 'text-achieved' }
  return revealed ? { label: 'No roster', tint: 'text-faint' } : { label: 'Seal your roster', tint: 'text-discarded' }
}
