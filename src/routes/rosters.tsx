import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FileUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IdentityGate } from '../client/components/IdentityGate'
import { ListBuilder } from '../client/components/ListBuilder'
import { meQuery, savedRostersQuery } from '../client/queries'
import { GAME_SIZES, type Secondary, type Stratagem } from '../core/battle'

export const Route = createFileRoute('/rosters')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(meQuery()), context.queryClient.ensureQueryData(savedRostersQuery())]),
  component: Rosters,
})

function Rosters() {
  const { data: me } = useSuspenseQuery(meQuery())
  const { data: saved } = useSuspenseQuery(savedRostersQuery())
  const [prep, setPrep] = useState<{ stratagems: Stratagem[]; secondaries: Secondary[] }>({ stratagems: [], secondaries: [] })
  const [editing, setEditing] = useState<string | null>(null)
  const [limit, setLimit] = useState<number | null>(null)
  if (!me) return <IdentityGate />

  const selected = editing === 'new' || editing === 'import' ? undefined : saved.find((roster) => roster.id === editing)
  if (editing) {
    return (
      <main className="mx-auto flex h-[calc(100dvh-5rem)] w-full max-w-[1600px] flex-col px-4 py-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Your rosters</p>
            <h1 className="text-2xl">{selected ? `Edit ${selected.name}` : 'Create editable roster'}</h1>
          </div>
          <Button variant="outline" onClick={() => setEditing(null)}>
            Back to rosters
          </Button>
        </div>
        <ListBuilder key={editing} prep={prep} onRestorePrep={setPrep} initial={selected} openImport={editing === 'import'} />
      </main>
    )
  }

  const shown = limit === null ? saved : saved.filter((roster) => roster.limit === limit)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your rosters</p>
          <h1 className="text-3xl">My rosters</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing('import')}>
            <FileUp /> Import roster
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus /> Create editable roster
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Battle size filter">
        <span className="eyebrow mr-1">Battle size</span>
        <button type="button" className={`chip ${limit === null ? 'border-azure text-azure' : ''}`} onClick={() => setLimit(null)}>
          All
        </button>
        {GAME_SIZES.map((size) => (
          <button
            key={size.limit}
            type="button"
            className={`chip ${limit === size.limit ? 'border-azure text-azure' : ''}`}
            onClick={() => setLimit(size.limit)}
          >
            {size.name} · {size.limit}
          </button>
        ))}
      </div>

      <section className="mt-4">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          <span className="readout">{shown.length}</span>
        </p>
        <div className="mt-2 space-y-2">
          {shown.length ? (
            shown.map((roster) => (
              <button
                key={roster.id}
                type="button"
                className="grid w-full grid-cols-[1fr_auto] items-center gap-4 border border-edge bg-panel p-3 text-left hover:border-azure"
                onClick={() => {
                  setPrep(roster.prep ?? { stratagems: [], secondaries: [] })
                  setEditing(roster.id)
                }}
              >
                <span>
                  <span className="block font-bold uppercase">{roster.name}</span>
                  <span className="text-xs text-dim">
                    {roster.picks.length} units · updated {new Date(roster.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="chip">{roster.limit} pts</span>
              </button>
            ))
          ) : (
            <p className="border border-edge bg-panel p-8 text-center text-sm text-dim">
              {saved.length ? 'No rosters at this battle size.' : 'No rosters yet. Create one or bring one from another app.'}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
