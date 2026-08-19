import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { SignInRequired } from '../client/components/SignInRequired'
import { PlayerAvatar } from '../client/components/PlayerAvatar'
import { battlesQuery, meQuery, playerProfileQuery } from '../client/queries'

export const Route = createFileRoute('/players/$playerId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(meQuery()),
      context.queryClient.ensureQueryData(battlesQuery()),
      context.queryClient.ensureQueryData(playerProfileQuery(params.playerId)),
    ]),
  component: PlayerProfile,
})

type Battle = Awaited<ReturnType<NonNullable<ReturnType<typeof battlesQuery>['queryFn']>>>[number]

/**
 * Who someone is, told entirely from the battles you have shared.
 *
 * Nothing here is a new disclosure: every fact on the page comes from a battle the
 * reader already sits in, so a profile cannot become a way to learn about a player
 * you have never faced.
 */
function PlayerProfile() {
  const { playerId } = Route.useParams()
  const { data: me } = useQuery(meQuery())
  const { data: battles = [] } = useQuery(battlesQuery())
  const { data: profile } = useQuery(playerProfileQuery(playerId))
  if (!me) return <SignInRequired title="Player" explanation="Sign in to see the players you have shared a battle with." />

  const shared = battles.filter((battle) => battle.playerIds.includes(playerId))
  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl">Nothing here</h1>
        <p className="mt-3 text-sm text-dim">You have not shared a battle with this player, so there is nothing to show.</p>
      </main>
    )
  }

  const yourself = playerId === me.id
  const finished = shared.filter((battle) => battle.status === 'finished')
  // Your own page counts every battle you finished; someone else's counts the ones you played against them.
  const outcomes = finished.map((battle) => (yourself ? ownResult(battle, me.id) : resultFor(battle, me.id, playerId)))
  const record = {
    won: outcomes.filter((outcome) => outcome === 'won').length,
    lost: outcomes.filter((outcome) => outcome === 'lost').length,
    drawn: outcomes.filter((outcome) => outcome === 'drawn').length,
  }
  const together = yourself ? 0 : shared.filter((battle) => sideOf(battle, me.id) === sideOf(battle, playerId)).length

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="flex items-center gap-4 border-b border-edge pb-4">
        <PlayerAvatar name={profile.name} image={profile.image} className="size-20 text-2xl" />
        <div className="min-w-0">
          <p className="eyebrow">{yourself ? 'You' : 'Player'}</p>
          <h1 className="truncate text-2xl">{profile.name}</h1>
          <p className="mt-2 text-sm text-dim">
            {yourself
              ? `${shared.length} ${shared.length === 1 ? 'battle' : 'battles'} played.`
              : `${shared.length} ${shared.length === 1 ? 'battle' : 'battles'} with you${
                  together ? `, ${together} of them on the same side` : ''
                }.`}
          </p>
        </div>
      </header>

      <section>
        <p className="rubric border-b border-edge pb-2">{yourself ? 'Your record' : 'Your record against them'}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Tally label="Won" value={record.won} className="text-achieved" />
          <Tally label="Lost" value={record.lost} className="text-side-a" />
          <Tally label="Drawn" value={record.drawn} className="text-dim" />
        </div>
        {finished.length ? null : (
          <p className="mt-3 text-sm text-dim">{yourself ? 'No finished battles yet.' : 'No finished battles between you yet.'}</p>
        )}
      </section>

      <section>
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Battles</span>
          <span className="readout">{shared.length}</span>
        </p>
        <div className="mt-2 space-y-2">
          {shared.map((battle) => (
            <Link
              key={battle.token}
              to="/battles/$token"
              params={{ token: battle.token }}
              className="flex items-center justify-between gap-3 border border-edge bg-panel p-3 hover:border-edge-strong"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold uppercase">{matchup(battle)}</span>
                <span className="block truncate text-xs text-dim">{battle.armies.filter(Boolean).join(' · ') || 'No armies attached'}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="eyebrow block">{battle.status === 'playing' ? `Round ${battle.round}` : battle.status}</span>
                <span className="readout block text-xs text-dim">{sideScores(battle).join('–')}</span>
                <span className="block text-[0.625rem] text-faint">{new Date(battle.lastActivity).toLocaleDateString()}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}

function Tally({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="border border-edge bg-panel p-3 text-center">
      <p className="eyebrow">{label}</p>
      <p className={`readout text-3xl leading-none font-bold ${className}`}>{value}</p>
    </div>
  )
}

const sideOf = (battle: Battle, playerId: string) => {
  const at = battle.playerIds.indexOf(playerId)
  return at === -1 ? null : (battle.sides[at] ?? null)
}

/** The two sides as they faced each other, so a 2v1 does not read as three duellists. */
function matchup(battle: Battle) {
  const bySide = new Map<number, string[]>()
  battle.players.forEach((player, at) => {
    const side = battle.sides[at] ?? 0
    bySide.set(side, [...(bySide.get(side) ?? []), player])
  })
  return [...bySide.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([, names]) => names.join(' & '))
    .join(' vs ')
}

/** One score per side, since a side shares it. */
function sideScores(battle: Battle) {
  const seen = new Set<number>()
  return battle.sides.flatMap((side, at) => {
    if (seen.has(side)) return []
    seen.add(side)
    return [battle.scores[at] ?? 0]
  })
}

/** How a finished battle went for the reader against whoever they were facing. */
function ownResult(battle: Battle, meId: string): 'won' | 'lost' | 'drawn' | null {
  const mine = sideOf(battle, meId)
  if (mine === null) return null
  const scoreFor = (side: number) => battle.scores[battle.sides.indexOf(side)] ?? 0
  const others = [...new Set(battle.sides)].filter((side) => side !== mine)
  if (!others.length) return null
  const best = Math.max(...others.map(scoreFor))
  return scoreFor(mine) > best ? 'won' : scoreFor(mine) < best ? 'lost' : 'drawn'
}

/** How a finished battle went for the reader, or null when the two shared a side. */
function resultFor(battle: Battle, meId: string, themId: string): 'won' | 'lost' | 'drawn' | null {
  const mine = sideOf(battle, meId)
  const theirs = sideOf(battle, themId)
  if (mine === null || theirs === null || mine === theirs) return null
  const scoreFor = (side: number) => battle.scores[battle.sides.indexOf(side)] ?? 0
  const difference = scoreFor(mine) - scoreFor(theirs)
  return difference > 0 ? 'won' : difference < 0 ? 'lost' : 'drawn'
}
