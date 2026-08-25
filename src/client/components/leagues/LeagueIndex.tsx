import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Eye, LockKeyhole, Users } from 'lucide-react'
import { leaguesQuery, meQuery } from '../../queries'
import { CreateLeague } from './CreateLeague'

export function LeagueIndex() {
  const { data: me } = useQuery(meQuery())
  const { data: leagues = [] } = useQuery(leaguesQuery())
  const mine = leagues.filter((league) => league.ownerId === me?.id || league.ownEntry)
  const publicLeagues = leagues.filter((league) => league.visibility === 'public' && !mine.includes(league))

  return (
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-3 py-5 sm:px-4 sm:py-7">
          <div>
            <p className="eyebrow text-parchment">Organized play</p>
            <h1 className="text-3xl">Leagues</h1>
            <p className="mt-2 max-w-2xl text-sm text-dim">
              Collect sealed rosters for a league, tournament, or private event, then reveal every accepted list together.
            </p>
          </div>
          {me ? <CreateLeague /> : null}
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-7 px-3 py-5 sm:px-4">
        {mine.length ? <LeagueShelf title="Your leagues" leagues={mine} /> : null}
        {publicLeagues.length ? <LeagueShelf title="Public leagues" leagues={publicLeagues} /> : null}
        {!leagues.length ? (
          <section className="border border-dashed border-edge bg-panel px-5 py-10 text-center">
            <Users className="mx-auto size-8 text-faint" />
            <h2 className="mt-4 text-xl">No leagues yet.</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-dim">
              {me ? 'Create the first event and share its registration link.' : 'Public leagues will appear here. Sign in to create one.'}
            </p>
          </section>
        ) : null}
      </div>
    </main>
  )
}

function LeagueShelf({
  title,
  leagues,
}: {
  title: string
  leagues: Awaited<ReturnType<NonNullable<ReturnType<typeof leaguesQuery>['queryFn']>>>
}) {
  return (
    <section>
      <div className="rubric mb-2 flex items-baseline justify-between border-b border-edge pb-2">
        <h2>{title}</h2>
        <span className="readout">{leagues.length}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {leagues.map((league) => (
          <Link
            key={league.id}
            to="/leagues/$token"
            params={{ token: league.token }}
            className="border border-edge bg-panel p-4 hover:border-info hover:bg-raised"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-bold uppercase">{league.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-dim">{league.description || `Organized by ${league.ownerName}`}</p>
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
              {league.ownEntry ? (
                <span className="chip text-parchment">
                  {league.ownEntry.submitted ? (league.ownEntry.rosterName ?? 'Roster submitted') : league.ownEntry.status}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
