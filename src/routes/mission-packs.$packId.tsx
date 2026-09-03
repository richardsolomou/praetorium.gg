import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MissionActions } from '../client/components/MissionActions'
import { MissionCardReference } from '../client/components/MissionCardReference'
import { dispositionTone } from '../client/components/rosterSetup'
import { gameReferencesQuery } from '../client/queries'

export const Route = createFileRoute('/mission-packs/$packId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(gameReferencesQuery())
    if (!data?.packs.some((pack) => pack.id === params.packId)) throw notFound()
  },
  component: MissionPackPage,
})

function MissionPackPage() {
  const { packId } = Route.useParams()
  const { data } = useQuery(gameReferencesQuery())
  const [secondaryId, setSecondaryId] = useState<string | null>(null)
  const pack = data?.packs.find((entry) => entry.id === packId)
  if (!data || !pack) return null

  const secondary = data.secondaries.find((entry) => entry.key === secondaryId)
  // The highest any mission in the pack states, and only what one of them actually
  // states. Read as a pair per category, because nothing says the two must agree.
  const missions = pack.missions
  const capOf = (pick: (mission: (typeof missions)[number]) => number | null | undefined) =>
    Math.max(0, ...missions.map((entry) => pick(entry) ?? 0))
  const allowance = (label: string, game: number, round: number) =>
    game ? [`${label} up to ${game} VP${round ? `, at most ${round} a round` : ''}`] : []
  const allowances = [
    ...allowance(
      'Primary missions',
      capOf((entry) => entry.gameCap),
      capOf((entry) => entry.roundCap),
    ),
    ...allowance(
      'Secondary missions',
      capOf((entry) => entry.secondaryGameCap),
      capOf((entry) => entry.secondaryRoundCap),
    ),
  ]

  return (
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <p className="eyebrow text-parchment">Mission pack</p>
          <h1 className="mt-1 text-3xl">{pack.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-dim">Choose your disposition down the left and your opponent’s across the top.</p>
          {allowances.length ? <p className="readout mt-1 text-xs text-dim">{allowances.join(' · ')}</p> : null}
        </div>
      </section>
      <section className="mx-auto mt-5 max-w-5xl px-3 sm:mt-7 sm:px-4">
        <h2 className="text-xl">Force dispositions</h2>
        <p className="mt-1 text-sm text-dim">Select the resulting mission to read its scoring rules.</p>
        <div className="mt-3 overflow-x-auto pb-2">
          <div
            className="grid min-w-[760px] gap-1.5"
            style={{ gridTemplateColumns: `9rem repeat(${data.dispositions.length}, minmax(7rem, 1fr))` }}
          >
            <div className="grid min-h-14 place-items-center border border-edge bg-sunken text-center text-xs font-bold text-dim uppercase">
              Opponent →<br />
              You ↓
            </div>
            {data.dispositions.map((entry) => (
              <div
                key={entry.id}
                className={`grid min-h-14 place-items-center border px-2 text-center text-xs font-bold uppercase ${dispositionTone(entry.id, true)}`}
              >
                {entry.name}
              </div>
            ))}
            {data.dispositions.map((you) => (
              <div key={you.id} className="contents">
                <div
                  className={`grid min-h-16 place-items-center border px-2 text-center text-xs font-bold uppercase ${dispositionTone(you.id, true)}`}
                >
                  {you.name}
                </div>
                {data.dispositions.map((opponent) => {
                  const found = pack.missions.find((candidate) =>
                    candidate.matchups.some((pair) => pair[0]?.id === you.id && pair[1]?.id === opponent.id),
                  )
                  return found ? (
                    <Link
                      key={opponent.id}
                      to="/mission-matchups/$packId/$you/$opponent"
                      params={{ packId, you: you.id, opponent: opponent.id }}
                      className="grid min-h-16 place-items-center border border-edge bg-panel px-2 text-center text-sm font-bold text-info uppercase hover:border-info hover:bg-raised"
                    >
                      {found.name}
                    </Link>
                  ) : (
                    <div key={opponent.id} className="grid min-h-16 place-items-center border border-edge bg-sunken text-xs text-faint">
                      Unavailable
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-7 max-w-5xl px-3 sm:px-4">
        <h2 className="rubric flex justify-between border-b border-edge pb-2">
          <span>Secondary missions</span>
          <span className="readout">{data.secondaries.length}</span>
        </h2>
        <div className="mt-2 grid gap-px border border-edge bg-edge sm:grid-cols-2">
          {data.secondaries.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setSecondaryId(card.key)}
              className="flex w-full items-center justify-between bg-panel px-3 py-2 text-left font-bold uppercase hover:bg-raised hover:text-info"
            >
              <span>{card.name}</span>
              <span className="text-xs text-dim">View</span>
            </button>
          ))}
        </div>
      </section>

      <p className="mx-auto mt-6 max-w-5xl border-t border-edge px-3 pt-3 pb-8 text-xs text-dim sm:px-4">{data.attribution}</p>

      <Dialog open={Boolean(secondary)} onOpenChange={(open) => !open && setSecondaryId(null)}>
        <DialogContent className="rounded-none border border-edge bg-panel text-bone ring-0 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl uppercase">{secondary?.name}</DialogTitle>
            <DialogDescription>Secondary mission</DialogDescription>
          </DialogHeader>
          {secondary ? <MissionCardReference card={secondary} type="Secondary mission" /> : null}
          {secondary ? <MissionActions actions={secondary.actions} /> : null}
        </DialogContent>
      </Dialog>
    </main>
  )
}
