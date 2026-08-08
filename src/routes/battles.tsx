import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { SignInRequired } from '../client/components/SignInRequired'
import { battlesQuery, meQuery } from '../client/queries'

type Battle = Awaited<ReturnType<NonNullable<ReturnType<typeof battlesQuery>['queryFn']>>>[number]

export const Route = createFileRoute('/battles')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(meQuery()), context.queryClient.ensureQueryData(battlesQuery())]),
  component: Battles,
})

function Battles() {
  const { data: me } = useQuery(meQuery())
  const { data: battles = [] } = useQuery(battlesQuery())
  if (!me) return <SignInRequired title="Your battles" explanation="Sign in to see the battles you have played and the ones still going." />

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your battles</p>
          <h1 className="text-2xl">My battles</h1>
        </div>
        <Button render={<Link to="/" />}>Open a battle</Button>
      </div>
      {battles.length ? (
        <div className="mt-5 space-y-6">
          <BattleShelf title="Active" battles={battles.filter((battle) => battle.status === 'playing')} />
          <BattleShelf title="Setup" battles={battles.filter((battle) => battle.status === 'setup')} />
          <BattleShelf title="Finished" battles={battles.filter((battle) => battle.status === 'finished')} />
        </div>
      ) : (
        <p className="mt-4 border border-edge bg-panel p-6 text-sm text-dim">No battles yet.</p>
      )}
    </main>
  )
}

function BattleShelf({ title, battles }: { title: string; battles: Battle[] }) {
  if (!battles.length) return null
  return (
    <section data-battle-shelf={title}>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{battles.length}</span>
      </p>
      <div className="mt-2 space-y-2">
        {battles.map((battle) => (
          <Link
            key={battle.token}
            to="/b/$token"
            params={{ token: battle.token }}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border border-edge bg-panel p-3 hover:border-edge-strong"
          >
            <BattleSide player={battle.players[0]} army={battle.armies[0]} score={battle.scores[0]} side="a" />
            <span className="text-center">
              <span className="eyebrow block">{battle.status === 'playing' ? `Round ${battle.round}` : battle.status}</span>
              <span className="block text-xs text-dim">
                {battle.status === 'playing' ? `${battle.phase} phase · ` : ''}
                {new Date(battle.lastActivity).toLocaleDateString()}
              </span>
            </span>
            <BattleSide player={battle.players[1]} army={battle.armies[1]} score={battle.scores[1]} side="b" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function BattleSide({ player, army, score, side }: { player?: string; army?: string | null; score?: number; side: 'a' | 'b' }) {
  const waiting = !player
  return (
    <span className={`min-w-0 ${side === 'b' ? 'text-right' : ''}`}>
      <span className={`readout block text-2xl ${side === 'a' ? 'text-side-a' : 'text-side-b'}`}>{score ?? 0}</span>
      <span className="block truncate font-bold uppercase">{player ?? 'Open seat'}</span>
      <span className="block truncate text-xs text-dim">{army ?? (waiting ? 'Waiting for an opponent' : 'List not attached')}</span>
    </span>
  )
}
