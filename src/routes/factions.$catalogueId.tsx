import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ShieldQuestion } from 'lucide-react'
import { favouriteDetachmentsFirst, useFavouriteDetachments } from '../client/favouriteDetachments'
import { factionQuery } from '../client/queries'
import { FavouriteDetachmentToggle } from '../client/components/FavouriteDetachmentToggle'
import { FavouriteFactionToggle } from '../client/components/FavouriteFactionToggle'
import { FactionMark, factionColour } from '../client/components/FactionMark'
import { dispositionTone } from '../client/components/rosterSetup'
import { RuleText } from '../client/components/RuleText'
import { PageState } from '../client/components/PageState'

export const Route = createFileRoute('/factions/$catalogueId')({
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(factionQuery(params.catalogueId)))) throw notFound()
  },
  component: FactionPage,
})

function FactionPage() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { catalogueId } = Route.useParams()
  const { data: faction } = useQuery(factionQuery(catalogueId))
  if (path !== `/factions/${catalogueId}`) return <Outlet />
  if (!faction) return null
  const reference = faction.references[0]
  const { favourites } = useFavouriteDetachments()
  const detachments = favouriteDetachmentsFirst(
    faction.detachments.filter((detachment) => faction.referenceDetachmentIds.includes(detachment.id)),
    faction.id,
    favourites,
  )

  return (
    <main className="w-full">
      <section
        className="relative overflow-hidden border-t-[3px] border-b border-edge bg-panel"
        style={{ borderTopColor: factionColour(faction.slug) }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl items-center gap-4 px-3 pt-[17px] pb-5 sm:px-4 sm:pt-[25px] sm:pb-7">
          <FactionMark id={faction.slug} icon={faction.icon} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-parchment">Faction</p>
            <h1 className="text-3xl">{faction.displayName}</h1>
          </div>
          <FavouriteFactionToggle catalogueId={faction.id} name={faction.displayName} />
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4">
        <Link to="/factions" className="eyebrow flex items-center gap-1 text-info hover:text-bone">
          <ChevronLeft className="size-3.5" /> Factions
        </Link>
        <section className="mt-4">
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
        {faction.armyRules.length ? (
          <section className="mt-6">
            <p className="rubric border-b border-edge pb-2">Faction abilities</p>
            <div className="mt-2 divide-y divide-edge border border-edge bg-panel">
              {faction.armyRules.map((rule) => (
                <article key={rule.name} className="p-3">
                  <h2 className="text-sm">{rule.name}</h2>
                  <RuleText text={rule.description} />
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <section className="mt-6">
          <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
            <span>Detachments</span>
            <span className="readout">{detachments.length}</span>
          </p>
          <div className="mt-2 divide-y divide-edge border border-edge bg-panel">
            {!detachments.length ? (
              <PageState
                headingLevel={2}
                eyebrow="Detachments"
                title="No detachments available"
                explanation="The current structured sources do not define detachments for this faction."
                icon={ShieldQuestion}
                className="border-0"
              />
            ) : null}
            {detachments.map((detachment) => {
              const content = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold uppercase">{detachment.name}</span>
                    {detachment.reference ? (
                      <span className="text-xs text-dim">
                        {detachment.reference.stratagems} stratagems · {detachment.reference.enhancements} enhancements
                        {detachment.reference.upgrades ? ` · ${detachment.reference.upgrades} unit upgrades` : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-dim">Reference details unavailable</span>
                    )}
                  </span>
                  {detachment.reference && (detachment.reference.dispositions.length || detachment.reference.points !== null) ? (
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {detachment.reference.dispositions.map((disposition) => (
                        <span key={disposition} className={`chip ${dispositionTone(disposition)}`}>
                          {disposition}
                        </span>
                      ))}
                      {detachment.reference.points == null ? null : <span className="chip">{detachment.reference.points} DP</span>}
                    </span>
                  ) : null}
                  {detachment.reference ? <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden /> : null}
                </>
              )
              return detachment.reference ? (
                <div key={detachment.id} className="flex items-center gap-1 px-3 py-2.5 hover:bg-raised">
                  <Link
                    to="/factions/$catalogueId/reference/detachments/$detachmentId"
                    params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4"
                  >
                    {content}
                  </Link>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              ) : (
                <div key={detachment.id} className="flex items-center gap-1 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-4">{content}</div>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
