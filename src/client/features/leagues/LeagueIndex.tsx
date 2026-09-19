import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Eye, LockKeyhole, Users } from 'lucide-react'
import { alliedLeagueRosterLimit } from '../../../core/league'
import { leaguesQuery, meQuery } from '../../queries'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { CreateLeague } from './CreateLeague'
import { LeagueCardActions } from './LeagueActions'

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
        description="Collect sealed rosters for a league, tournament, or private event, then reveal every accepted list together."
        actions={me ? <CreateLeague /> : null}
      />
      <PageContent className="space-y-6">
        {mine.length ? <LeagueShelf title="Your leagues" leagues={mine} viewerId={me?.id ?? null} /> : null}
        {publicLeagues.length ? <LeagueShelf title="Public leagues" leagues={publicLeagues} viewerId={me?.id ?? null} /> : null}
        {!leagues.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Organized play"
            title="No leagues yet"
            explanation={
              me ? 'Create the first event and share its registration link.' : 'Public leagues will appear here. Sign in to create one.'
            }
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
      <div className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
        <h2>{title}</h2>
        <span className="readout">{leagues.length}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {leagues.map((league) => {
          const card = (
            <Link to="/leagues/$token" params={{ token: league.token }} className="block min-w-0 flex-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold uppercase">{league.name}</h3>
                  {league.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-dim">{league.description}</p>
                  ) : (
                    <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-dim">
                      <span className="shrink-0">Organized by</span>
                      <PlayerAvatar name={league.ownerName} image={league.ownerImage} className="size-5 text-3xs" />
                      <span className="truncate">{league.ownerName}</span>
                    </p>
                  )}
                </div>
                {league.visibility === 'private' ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-dim">
                    <LockKeyhole className="size-4" /> Private
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-info">
                    <Eye className="size-4" /> Public
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-dim">
                <span className="chip">
                  {league.entrantCount}
                  {league.playerLimit ? ` / ${league.playerLimit}` : ''} accepted
                </span>
                <span className="chip">
                  {league.revealedAt
                    ? 'Rosters revealed'
                    : (
                          league.admission === 'approval' && league.playerLimit !== null
                            ? league.entrantCount >= league.playerLimit || league.occupiedCount >= 128
                            : league.occupiedCount >= (league.playerLimit ?? 128)
                        )
                      ? 'Registration full'
                      : 'Registration open'}
                </span>
                {league.eventNumber > 1 ? <span className="chip text-info">{league.eventNumber} events</span> : null}
                {league.format && league.rosterLimit ? (
                  <span className="chip">
                    {league.format === '2v1'
                      ? `2v1 · ${league.rosterLimit.toLocaleString()}/${alliedLeagueRosterLimit(league.rosterLimit).toLocaleString()}`
                      : league.format === '2v2'
                        ? `Doubles · ${league.rosterLimit.toLocaleString()} per force`
                        : `1v1 · ${league.rosterLimit.toLocaleString()}`}
                  </span>
                ) : null}
                {league.ownEntry ? (
                  <span className="chip text-parchment">
                    {league.ownEntry.submitted ? (league.ownEntry.rosterName ?? 'Roster submitted') : league.ownEntry.status}
                  </span>
                ) : null}
              </div>
            </Link>
          )
          if (league.ownerId !== viewerId) {
            return (
              <article
                key={league.id}
                data-league={league.token}
                className="min-w-0 border border-edge bg-panel hover:border-info hover:bg-raised"
              >
                {card}
              </article>
            )
          }
          return (
            <LeagueCardActions
              key={league.id}
              league={{
                ...league,
                currentEventFormat: league.format,
                currentEventRevealedAt: league.revealedAt,
                currentAcceptedCount: league.entrantCount,
              }}
            >
              {(menu) => (
                <div className="flex min-w-0 items-start">
                  {card}
                  <div className="p-2">{menu}</div>
                </div>
              )}
            </LeagueCardActions>
          )
        })}
      </div>
    </section>
  )
}
