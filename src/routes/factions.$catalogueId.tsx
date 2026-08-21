import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { factionFor } from '../client/factions'
import { factionsQuery } from '../client/queries'
import { FactionMark, factionColour } from '../client/components/FactionMark'
import { dispositionTone } from '../client/components/rosterSetup'
import { RuleText } from '../client/components/RuleText'

export const Route = createFileRoute('/factions/$catalogueId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    if (!factionFor(data, params.catalogueId)) throw notFound()
  },
  component: FactionPage,
})

function FactionPage() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { catalogueId } = Route.useParams()
  const { data } = useQuery(factionsQuery())
  if (path !== `/factions/${catalogueId}`) return <Outlet />
  const faction = factionFor(data, catalogueId)
  if (!faction) return null
  const reference = faction.references[0]
  const detachments = faction.detachments.filter((detachment) => faction.referenceDetachmentIds.includes(detachment.id))

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link to="/factions" className="eyebrow flex items-center gap-1 text-info hover:text-bone">
        <ChevronLeft className="size-3.5" /> Factions
      </Link>
      <header className="mt-4 flex items-center gap-4 border-b pb-4" style={{ borderBottomColor: factionColour(faction.slug) }}>
        <FactionMark id={faction.slug} icon={faction.icon} size="lg" />
        <span>
          <p className="eyebrow">Faction</p>
          <h1 className="text-3xl">{faction.displayName}</h1>
        </span>
      </header>
      <section className="mt-5">
        <Link
          to="/factions/$catalogueId/datasheets"
          params={{ catalogueId: faction.slug }}
          className="flex items-center justify-between border border-edge bg-panel px-3 py-3 hover:bg-raised"
        >
          <span className="font-bold uppercase">Datasheets</span>
          <span className="flex items-center gap-3">
            <span className="readout">{reference?.datasheets ?? 0}</span>
            <ChevronRight className="size-4 text-dim" aria-hidden />
          </span>
        </Link>
      </section>
      {faction.armyRule ? (
        <section className="mt-6">
          <p className="rubric border-b border-edge pb-2">Faction abilities</p>
          <article className="mt-2 border border-edge bg-panel p-3">
            <h2 className="text-sm">{faction.armyRule.name}</h2>
            <RuleText text={faction.armyRule.description} />
          </article>
        </section>
      ) : null}
      <section className="mt-6">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Detachments</span>
          <span className="readout">{detachments.length}</span>
        </p>
        <div className="mt-2 divide-y divide-edge border border-edge bg-panel">
          {detachments.map((detachment) => (
            <Link
              key={detachment.id}
              to="/factions/$catalogueId/reference/detachments/$detachmentId"
              params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
              className="flex items-center justify-between gap-4 px-3 py-2.5 hover:bg-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold uppercase">{detachment.name}</span>
                {detachment.reference ? (
                  <>
                    <span className="text-xs text-dim">
                      {detachment.reference.stratagems} stratagems · {detachment.reference.enhancements} enhancements
                      {detachment.reference.upgrades ? ` · ${detachment.reference.upgrades} unit upgrades` : ''}
                    </span>
                  </>
                ) : null}
              </span>
              {detachment.reference && (detachment.reference.dispositions.length || detachment.reference.points !== null) ? (
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {detachment.reference?.dispositions.map((disposition) => (
                    <span key={disposition} className={`chip ${dispositionTone(disposition)}`}>
                      {disposition}
                    </span>
                  ))}
                  {detachment.reference?.points == null ? null : <span className="chip">{detachment.reference.points} DP</span>}
                </span>
              ) : null}
              <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
