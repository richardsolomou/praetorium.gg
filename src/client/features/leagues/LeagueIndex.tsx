import { GuideHelp } from '../onboarding/GuideHelp'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Eye, LockKeyhole, Users } from 'lucide-react'
import { isLeagueOrganizer } from '../../../core/league'
import { leaguesQuery, meQuery } from '../../queries'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { CreateLeague } from './CreateLeague'
import { LEAGUE_CARD, LeagueCardActions } from './LeagueActions'
import { leagueFormat, leaguePhase, leaguePlayers } from './leagueEvent'

export function LeagueIndex() {
  const { data: me } = useQuery(meQuery())
  const { data: leagues = [] } = useQuery(leaguesQuery())
  const mine = leagues.filter((league) => league.personal)
  const publicLeagues = leagues.filter((league) => league.visibility === 'public' && !mine.includes(league))

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Organized play"
        title="Leagues"
        description="Everyone seals a roster in secret, the rosters open together, then you play each other and the results build up."
        actions={
          me ? (
            <>
              <GuideHelp task="league">League guide</GuideHelp>
              <CreateLeague />
            </>
          ) : null
        }
      />
      <PageContent className="space-y-6">
        {mine.length ? <LeagueShelf title="Your leagues" leagues={mine} viewerId={me?.id ?? null} /> : null}
        {publicLeagues.length ? <LeagueShelf title="Public leagues" leagues={publicLeagues} viewerId={me?.id ?? null} /> : null}
        {!leagues.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Organized play"
            title="No leagues yet"
            explanation={me ? 'Create one and send the link to your group.' : 'Public leagues will appear here. Sign in to create one.'}
            icon={Users}
          />
        ) : null}
      </PageContent>
    </main>
  )
}

function LeagueShelf({
  title,
  leagues,
  viewerId,
}: {
  title: string
  leagues: Awaited<ReturnType<NonNullable<ReturnType<typeof leaguesQuery>['queryFn']>>>
  viewerId: string | null
}) {
  return (
    <section>
      <h2 className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
        {title} <span className="readout">{leagues.length}</span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {leagues.map((league) => {
          const organizer = isLeagueOrganizer(league, league.adminIds, viewerId)
          // One status: the reader's own place when they have one, otherwise where the league stands.
          const status = league.ownEntry
            ? ownEntryStatus(league.ownEntry, Boolean(league.revealedAt))
            : leaguePhase(league, league.entrantCount, league.occupiedCount)
          const format = leagueFormat(league)
          const card = (
            <Link to="/leagues/$token" params={{ token: league.token }} className="flex min-w-0 flex-1 flex-col">
              <div className={`flex-1 p-4 ${organizer ? 'pr-12' : ''}`}>
                <p className="flex items-center gap-2 text-xs text-dim">
                  {league.visibility === 'private' ? (
                    <LockKeyhole className="size-3.5 shrink-0" aria-label="Private" />
                  ) : (
                    <Eye className="size-3.5 shrink-0 text-info" aria-label="Public" />
                  )}
                  <span className="truncate tracking-label uppercase">{format ?? 'Any format'}</span>
                </p>
                <h3 className="mt-1.5 truncate text-lg leading-tight font-bold uppercase">{league.name}</h3>
                {league.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-dim">{league.description}</p>
                ) : (
                  <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-dim">
                    <PlayerAvatar name={league.ownerName} image={league.ownerImage} className="size-5 text-3xs" />
                    <span className="truncate">Organized by {league.ownerName}</span>
                  </p>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-3 border-t border-edge bg-sunken/60 px-4 py-2.5 text-sm">
                <span className={`flex min-w-0 items-center gap-2 font-semibold ${status.tint}`}>
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
                  <span className="truncate">{status.label}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs text-dim">
                  {[leaguePlayers(league, league.entrantCount), league.eventNumber > 1 ? `Event ${league.eventNumber}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            </Link>
          )
          if (!organizer) {
            return (
              <article key={league.id} data-league={league.token} className={LEAGUE_CARD}>
                {card}
              </article>
            )
          }
          return (
            <LeagueCardActions key={league.id} league={league} canDelete={league.ownerId === viewerId}>
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

/** Where the reader's own entry stands, tinted by whether it needs them: amber to act, green once done. */
function ownEntryStatus(entry: { status: 'pending' | 'accepted' | 'rejected'; submitted: boolean }, revealed: boolean) {
  if (entry.status === 'pending') return { label: 'Waiting for approval', tint: 'text-dim' }
  if (entry.status === 'rejected') return { label: 'Not in this league', tint: 'text-faint' }
  if (entry.submitted)
    return revealed ? { label: 'Rosters revealed', tint: 'text-achieved' } : { label: 'Your roster is sealed', tint: 'text-achieved' }
  return revealed ? { label: 'No roster', tint: 'text-faint' } : { label: 'Seal your roster', tint: 'text-discarded' }
}
