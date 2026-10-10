import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ShieldQuestion } from 'lucide-react'
import { favouriteDetachmentsFirst, useFavouriteDetachments } from '../../../favouriteDetachments'
import { factionIndexQuery, factionQuery } from '../../../queries'
import { FavouriteDetachmentToggle } from './FavouriteDetachmentToggle'
import { FavouriteFactionToggle } from './FavouriteFactionToggle'
import { FactionMark, factionColour } from '../../../components/FactionMark'
import { dispositionTone } from '../../../components/rosterSetup'
import { RuleText } from '../../../components/RuleText'
import { PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { editionFamilyId, editionLabel } from '../../../../core/catalogueEdition'
import { useDateFormatting } from '../../../dates'
import { factionReferenceHref } from '../../../../core/factionReferenceRoute'

export function FactionPage({ catalogueId, routeCatalogueId = catalogueId }: { catalogueId: string; routeCatalogueId?: string }) {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { data: faction } = useQuery(factionQuery(catalogueId))
  const direct = path === `/factions/${routeCatalogueId}`
  const { data: index } = useQuery({ ...factionIndexQuery(), enabled: direct })
  const navigate = useNavigate()
  const { date } = useDateFormatting()
  const { favourites } = useFavouriteDetachments(direct)
  if (!direct) return <Outlet />
  if (!faction) return null
  const editions = index?.factions.filter((entry) => editionFamilyId(entry.id) === editionFamilyId(faction.id)) ?? []
  const reference = faction.references[0]
  const detachments = favouriteDetachmentsFirst(
    faction.detachments.filter((detachment) => faction.referenceDetachmentIds.includes(detachment.id)),
    faction.id,
    favourites,
  )

  return (
    <main className="w-full">
      <PageHeader
        tint={factionColour(faction.slug, faction.displayName)}
        eyebrow="Faction"
        title={faction.displayName}
        media={<FactionMark id={faction.slug} name={faction.displayName} edition={faction.edition} icon={faction.icon} size="lg" />}
        actions={
          <>
            {editions.length > 1 ? (
              <div className="min-w-48 max-w-full">
                <SearchableSelect
                  id="reference-edition"
                  ariaLabel="Rules version"
                  placeholder="Choose a rules version"
                  value={faction.id}
                  groups={[
                    {
                      label: '',
                      items: editions.map((entry) => ({
                        value: entry.id,
                        label: entry.edition ? editionLabel(entry.edition) : !entry.isDefault ? 'Previous rules' : 'Current rules',
                      })),
                    },
                  ]}
                  onValueChange={(id) => {
                    const selected = editions.find((entry) => entry.id === id)
                    if (selected) void navigate({ href: factionReferenceHref(selected) })
                  }}
                />
              </div>
            ) : null}
            <FavouriteFactionToggle catalogueId={faction.id} name={faction.displayName} />
          </>
        }
      />
      <PageContent>
        <Link to="/factions" className="eyebrow flex items-center gap-1 text-info hover:text-bone">
          <ChevronLeft className="size-3.5" /> Factions
        </Link>
        {faction.edition ? (
          <details className="mt-4 border border-edge bg-panel px-3 py-2">
            <summary className="rubric cursor-pointer">Rules history</summary>
            <ol className="mt-2 space-y-1 text-sm text-dim">
              {faction.edition.releases.map((release) => (
                <li key={release.at}>
                  {date(release.at)} ·{' '}
                  {release.status === 'preview'
                    ? 'Preview published'
                    : release.status === 'released'
                      ? 'Officially released'
                      : 'Previous rules'}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <section className="mt-4">
          <FactionReferenceLink
            data-onboarding="faction-datasheets"
            to="/factions/$catalogueId/datasheets"
            params={{ catalogueId: faction.slug }}
            className="flex items-center justify-between border border-edge bg-panel px-3 py-3 hover:bg-raised"
          >
            <span className="font-bold uppercase">Datasheets</span>
            <span className="flex items-center gap-3">
              <span className="readout">{reference?.datasheets ?? 0}</span>
              <ChevronRight className="size-4 text-dim" aria-hidden />
            </span>
          </FactionReferenceLink>
          <Link
            to="/data-updates/$catalogueId"
            params={{ catalogueId: faction.slug }}
            search={{}}
            className="mt-2 flex items-center justify-between border border-edge bg-panel px-3 py-3 hover:bg-raised"
          >
            <span className="font-bold uppercase">Data updates</span>
            <ChevronRight className="size-4 text-dim" aria-hidden />
          </Link>
        </section>
        {faction.armyRules.length ? (
          <section data-onboarding="faction-army-rules" className="mt-6">
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
        <section data-onboarding="faction-detachments" className="mt-6">
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
                explanation="No detachment rules are available for this faction."
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
                  {detachment.reference?.dispositions.length || detachment.points !== null ? (
                    <span className="flex shrink-0 flex-wrap justify-end gap-1 max-sm:order-last max-sm:basis-full max-sm:justify-start">
                      {detachment.reference?.dispositions.map((disposition) => (
                        <span key={disposition} className={`chip ${dispositionTone(disposition)}`}>
                          {disposition}
                        </span>
                      ))}
                      {detachment.points == null ? null : <span className="chip">{detachment.points} DP</span>}
                    </span>
                  ) : null}
                  {detachment.reference ? <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden /> : null}
                </>
              )
              return detachment.reference ? (
                <div key={detachment.id} className="flex items-center gap-1 px-3 py-2.5 hover:bg-raised">
                  <FactionReferenceLink
                    to="/factions/$catalogueId/detachments/$detachmentId"
                    params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
                    className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 sm:flex-nowrap"
                  >
                    {content}
                  </FactionReferenceLink>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              ) : (
                <div key={detachment.id} className="flex items-center gap-1 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 sm:flex-nowrap">
                    {content}
                  </div>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              )
            })}
          </div>
        </section>
      </PageContent>
    </main>
  )
}
