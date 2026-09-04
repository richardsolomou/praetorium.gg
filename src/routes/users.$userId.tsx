import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { UserX } from 'lucide-react'
import type { ServiceRecord } from '../core/serviceRecord'
import { BattleShelf } from '../client/components/battles/BattleShelf'
import { PageState } from '../client/components/PageState'
import { PlayerAvatar } from '../client/components/PlayerAvatar'
import { PlayerRankings } from '../client/components/profile/PlayerRankings'
import { PlayerRosters } from '../client/components/profile/PlayerRosters'
import { ServiceRecordPanel } from '../client/components/profile/ServiceRecordPanel'
import {
  factionIndexQuery,
  meQuery,
  type PlayerProfileFilter,
  playerProfileQuery,
  playerRankingsQuery,
  playerRostersQuery,
  userProfileQuery,
} from '../client/queries'

/** The filter as an address carries it, so a narrowed record is a link. */
const readFilter = (search: Record<string, unknown>): PlayerProfileFilter => {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
  const size = Number(search.limit)
  return {
    faction: text(search.faction),
    detachment: text(search.detachment),
    opponentFaction: text(search.opponentFaction),
    opponentDetachment: text(search.opponentDetachment),
    opponentId: text(search.opponentId),
    missionPackId: text(search.missionPackId),
    limit: Number.isFinite(size) && size > 0 ? size : undefined,
  }
}

export const Route = createFileRoute('/users/$userId')({
  validateSearch: readFilter,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(meQuery()),
      context.queryClient.ensureQueryData(userProfileQuery(params.userId)),
      context.queryClient.ensureQueryData(playerProfileQuery(params.userId, deps)),
      context.queryClient.ensureQueryData(playerRankingsQuery(params.userId)),
      context.queryClient.ensureQueryData(playerRostersQuery(params.userId)),
    ]),
  component: PlayerProfile,
})

/**
 * One player, open to anybody.
 *
 * A name was already public; this makes the games behind it public too, but only
 * as far as their own answer allows — the server narrows the list with the same
 * fold a battle link reads, so a profile can never list a battle that link would
 * refuse. A player who keeps their battles private has a name here and nothing
 * else, which is exactly what they asked for.
 *
 * Nothing on the page is stored. The rankings come from the leaderboard's own fold
 * and the record from these battles, so neither can drift from the table it agrees
 * with.
 */
function PlayerProfile() {
  const { userId } = Route.useParams()
  const filter = Route.useSearch()
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: profile } = useQuery(userProfileQuery(userId))
  const { data } = useQuery(playerProfileQuery(userId, filter))
  const { data: rankings } = useQuery(playerRankingsQuery(userId))
  const { data: published } = useQuery(playerRostersQuery(userId))
  // Only fetched when there is a list to name a faction for, since the index is large.
  const factions = useQuery({ ...factionIndexQuery(), enabled: Boolean(published?.rosters.length) })
  if (!profile) {
    return (
      <main className="flex w-full">
        <PageState
          className="flex-1 border-x-0 border-t-0"
          eyebrow="Player profile"
          title="No such player"
          explanation="This account does not exist, or it has been deleted."
          icon={UserX}
        />
      </main>
    )
  }

  const yourself = userId === me?.id
  const record = data?.record
  return (
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl items-center gap-4 px-3 py-5 sm:px-4 sm:py-7">
          <PlayerAvatar name={profile.name} image={profile.image} className="size-20 text-2xl" />
          <div className="min-w-0">
            <p className="eyebrow text-parchment">{yourself ? 'You' : 'Player'}</p>
            <h1 className="truncate text-2xl">{profile.name}</h1>
            <p className="mt-2 text-sm text-dim">{record ? summarise(record) : ''}</p>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-6 px-3 pt-4 pb-8 sm:px-4">
        {rankings ? <PlayerRankings rankings={rankings} /> : null}
        {published ? (
          <PlayerRosters
            rosters={published.rosters}
            totals={new Map(published.totals.map((entry) => [entry.id, entry]))}
            factions={factions.data?.factions ?? []}
            factionsLoading={factions.isPending}
          />
        ) : null}
        {data ? (
          <ServiceRecordPanel
            record={data.record}
            facets={data.facets}
            filter={filter}
            onFilter={(next) => void navigate({ to: '/users/$userId', params: { userId }, search: next })}
          />
        ) : null}

        {data?.battles.length ? (
          <div>
            <BattleShelf title="Battles" battles={[...data.battles]} />
            {data.played > data.battles.length ? (
              <p className="mt-2 text-xs text-faint">
                The {data.battles.length} most recent of {data.played}.
              </p>
            ) : null}
          </div>
        ) : (
          <section>
            <p className="rubric border-b border-edge pb-2">Battles</p>
            <p className="mt-2 border border-edge bg-panel p-5 text-sm text-dim">
              {yourself
                ? 'None of your battles are listed here. Only the ones your sharing setting allows appear.'
                : 'This player has no battles anyone else can watch.'}
            </p>
          </section>
        )}
      </div>
    </main>
  )
}

/**
 * The one-line answer to "who is this player", in words rather than a dash-run.
 *
 * `8–2–1` reads as a score to anybody who has not been told the order. The counts
 * are broken out properly by the record below; this only has to be readable.
 */
function summarise(record: ServiceRecord) {
  if (!record.battles) return 'No finished battles to show.'
  const parts = [
    `${record.won} ${record.won === 1 ? 'win' : 'wins'}`,
    `${record.lost} ${record.lost === 1 ? 'loss' : 'losses'}`,
    ...(record.drawn ? [`${record.drawn} ${record.drawn === 1 ? 'draw' : 'draws'}`] : []),
  ]
  const listed = parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join(' and ')
  return `${listed} from ${record.battles} ${record.battles === 1 ? 'battle' : 'battles'}.`
}
