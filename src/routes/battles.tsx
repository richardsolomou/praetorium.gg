import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { IdentityGate } from '../client/components/IdentityGate'
import { battlesQuery, meQuery } from '../client/queries'

export const Route = createFileRoute('/battles')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(meQuery()), context.queryClient.ensureQueryData(battlesQuery())]),
  component: Battles,
})

function Battles() {
  const { data: me } = useSuspenseQuery(meQuery())
  const { data: battles } = useSuspenseQuery(battlesQuery())
  if (!me) return <IdentityGate />

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your battles</p>
          <h1 className="text-2xl">Battle history</h1>
        </div>
        <Button render={<Link to="/" />}>Open a battle</Button>
      </div>
      <div className="mt-4 space-y-2">
        {battles.length ? (
          battles.map((battle) => (
            <Link
              key={battle.token}
              to="/b/$token"
              params={{ token: battle.token }}
              className="grid grid-cols-[1fr_auto] gap-3 border border-edge bg-panel p-3 hover:border-edge-strong"
            >
              <span>
                <span className="block font-bold uppercase">{battle.players.join(' versus ') || 'Waiting for an opponent'}</span>
                <span className="text-xs text-dim">
                  {battle.status === 'playing' ? `Round ${battle.round} · ${battle.phase} phase` : battle.status}
                </span>
              </span>
              <span className="readout self-center text-xl">{battle.scores.join('–')}</span>
            </Link>
          ))
        ) : (
          <p className="border border-edge bg-panel p-6 text-sm text-dim">No battles yet.</p>
        )}
      </div>
    </main>
  )
}
