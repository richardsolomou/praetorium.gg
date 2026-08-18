import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Printer } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { priceQuery, savedRosterPriceQuery, sharedRosterQuery } from '../client/queries'
import { ROSTER_SOURCE_LABELS } from '../core/savedRoster'

export const Route = createFileRoute('/r/$id')({
  loader: async ({ context, params }) => {
    const roster = await context.queryClient.ensureQueryData(sharedRosterQuery(params.id))
    if (!roster) throw notFound()
    await context.queryClient.ensureQueryData(
      savedRosterPriceQuery(
        roster.id,
        roster.catalogueId,
        roster.detachmentIds,
        roster.disposition,
        roster.limit,
        roster.picks.map(({ entryId, catalogueId, models, choices, spreads, toggles }) => ({
          entryId,
          catalogueId,
          models,
          choices,
          spreads,
          toggles,
        })),
      ),
    )
  },
  component: SharedRoster,
})

function SharedRoster() {
  const { id } = Route.useParams()
  const { data: roster } = useQuery(sharedRosterQuery(id))
  const { data: priced } = useQuery(
    priceQuery(
      roster?.catalogueId ?? '',
      roster?.detachmentIds ?? [],
      roster?.disposition ?? null,
      roster?.limit ?? 0,
      roster?.picks.map(({ entryId, models, choices, spreads, toggles }) => ({ entryId, models, choices, spreads, toggles })) ?? [],
    ),
  )
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('print') === 'true') window.print()
  }, [])
  if (!roster) return null

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">{roster.visibility === 'private' ? 'Private roster' : 'Unlisted roster'}</p>
          <h1 className="text-3xl">{roster.name}</h1>
          <p className="mt-1 text-sm text-dim">
            {priced?.detachments.map((detachment) => detachment.name).join(' · ') || 'No detachment'} · {roster.picks.length} units ·{' '}
            {ROSTER_SOURCE_LABELS[roster.source]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="readout text-2xl font-bold">
            {priced?.points ?? '—'}/{roster.limit}
          </span>
          <Button variant="outline" size="sm" data-print-hide onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </header>

      {priced?.errors.length ? (
        <div className="mt-4 border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          This roster has {priced.errors.length} validation {priced.errors.length === 1 ? 'issue' : 'issues'} against the current catalogue
          revision.
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {(priced?.units ?? []).map((unit) => (
          <article key={unit.key} className="border border-edge bg-panel p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base">{unit.name}</h2>
              <span className="chip">{unit.points} pts</span>
            </div>
            <p className="readout mt-1 text-xs text-dim">{unit.size.models} models</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
              {unit.wargear.map((piece) => (
                <li key={piece.name}>
                  {piece.count}x {piece.name}
                </li>
              ))}
            </ul>
            {[
              ...unit.enhancements.map((name) => ({ kind: 'Enhancement', name })),
              ...unit.upgrades.map((name) => ({ kind: 'Upgrade', name })),
            ].map((entry) => (
              <div key={`${entry.kind}-${entry.name}`} className="mt-2 flex items-center gap-2 border-t border-edge pt-2">
                <span className="chip text-achieved">{entry.kind}</span>
                <span className="text-xs font-semibold">{entry.name}</span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </main>
  )
}
