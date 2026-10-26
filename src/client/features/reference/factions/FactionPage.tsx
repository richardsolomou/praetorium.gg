import { RulesVersionLabel } from '../../../components/RulesVersionLabel'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { favouriteDetachmentsFirst, useFavouriteDetachments } from '../../../favouriteDetachments'
import { discoveredRostersQuery, factionIndexQuery, factionQuery } from '../../../queries'
import { FavouriteDetachmentToggle } from './FavouriteDetachmentToggle'
import { FavouriteFactionToggle } from './FavouriteFactionToggle'
import { FactionMark, factionColour } from '../../../components/FactionMark'
import { dispositionTone } from '../../../components/rosterSetup'
import { RuleText } from '../../../components/RuleText'
import { PageContent, PageHeader } from '../../../components/Page'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { rulesVersionLabel } from '../../../../core/catalogueEdition'
import { currentCatalogueFamilyId } from '../../../../core/retiredCatalogueIds'
import { useDateFormatting } from '../../../dates'
import { factionReferenceHref } from '../../../../core/factionReferenceRoute'
import { StartRoster } from '../../rosters/ReferenceRosterActions'

export function FactionPage({ catalogueId }: { catalogueId: string }) {
  const { data: faction } = useQuery(factionQuery(catalogueId))
  const { data: index } = useQuery(factionIndexQuery())
  const navigate = useNavigate()
  const { date } = useDateFormatting()
  const { favourites } = useFavouriteDetachments()
  // The rosters page asks for exactly this filter and order, so following the link reuses the answer.
  const { data: publicRosters } = useInfiniteQuery({
    ...discoveredRostersQuery({ faction: faction ? currentCatalogueFamilyId(faction.id) : '' }, 'public', 'updated-desc'),
    enabled: Boolean(faction),
  })
  const publicArmies = publicRosters?.pages[0]?.total ?? null
  if (!faction) return null
  const editions = index?.factions.filter((entry) => currentCatalogueFamilyId(entry.id) === currentCatalogueFamilyId(faction.id)) ?? []
  editions.sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
  const reference = faction.references[0]
  const pageActions = (
    <div className="flex items-center gap-1">
      {faction.detachments.length ? <StartRoster faction={faction} /> : null}
      <FavouriteFactionToggle catalogueId={faction.id} name={faction.displayName} />
    </div>
  )
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
        media={<FactionMark faction={faction} size="lg" />}
        actions={
          editions.length > 1 ? (
            <div className="grid grid-cols-[minmax(0,20rem)_auto] items-center gap-2">
              <div className="min-w-0">
                <SearchableSelect
                  id="reference-edition"
                  ariaLabel="Rules version"
                  placeholder="Choose a rules version"
                  popupClassName="min-w-80 max-w-[calc(100vw-2rem)]"
                  value={faction.id}
                  groups={[
                    {
                      label: '',
                      items: editions.map((entry) => ({
                        value: entry.id,
                        label: rulesVersionLabel(entry),
                        content: <RulesVersionLabel faction={entry} />,
                      })),
                    },
                  ]}
                  onValueChange={(id) => {
                    const selected = editions.find((entry) => entry.id === id)
                    if (selected) void navigate({ href: factionReferenceHref(selected) })
                  }}
                />
              </div>
              {pageActions}
            </div>
          ) : (
            pageActions
          )
        }
      />
      <PageContent className="space-y-6">
        <Link to="/factions" className="eyebrow flex items-center gap-1 text-info hover:text-bone">
          <ChevronLeft className="size-3.5" /> Factions
        </Link>
        <section className="grid grid-cols-1 gap-px border border-edge bg-edge sm:grid-cols-3">
          <FactionReferenceLink
            to="/factions/$catalogueId/datasheets"
            params={{ catalogueId: faction.slug }}
            className="flex items-center justify-between bg-panel px-3 py-3 hover:bg-raised"
          >
            <span className="font-bold uppercase">Datasheets</span>
            <span className="flex items-center gap-3">
              <span className="readout">{reference?.datasheets ?? 0}</span>
              <ChevronRight className="size-4 text-dim" aria-hidden />
            </span>
          </FactionReferenceLink>
          <Link
            to="/rosters"
            search={{ view: 'public', faction: faction.slug }}
            className="flex items-center justify-between bg-panel px-3 py-3 hover:bg-raised"
          >
            <span className="font-bold uppercase">Public armies</span>
            <span className="flex items-center gap-3">
              {publicArmies === null ? null : <span className="readout">{publicArmies}</span>}
              <ChevronRight className="size-4 text-dim" aria-hidden />
            </span>
          </Link>
          <Link
            to="/data-updates/$catalogueId"
            params={{ catalogueId: faction.slug }}
            search={{}}
            className="flex items-center justify-between bg-panel px-3 py-3 hover:bg-raised"
          >
            <span className="font-bold uppercase">Data updates</span>
            <ChevronRight className="size-4 text-dim" aria-hidden />
          </Link>
        </section>
        {faction.armyRules.length ? (
          <section>
            <h2 className="rubric border-b border-edge pb-2">Faction abilities</h2>
            <div className="mt-2 divide-y divide-edge border border-edge bg-panel">
              {faction.armyRules.map((rule) => (
                <article key={rule.name} className="p-3">
                  <h3 className="text-sm">{rule.name}</h3>
                  <RuleText text={rule.description} />
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <section aria-label="Detachments">
          <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
            <span>Detachments</span>
            <span className="readout">{detachments.length}</span>
          </h2>
          <div className="mt-2 grid grid-cols-1 gap-px border border-edge bg-panel md:grid-cols-2">
            {!detachments.length ? (
              <p className="px-3 py-2 text-sm text-dim md:col-span-2">No detachment rules are available for this faction.</p>
            ) : null}
            {detachments.map((detachment) => {
              const content = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold uppercase">{detachment.name}</span>
                    {detachment.reference ? (
                      <span className="block text-xs text-dim">
                        {[
                          [detachment.reference.stratagems, 'stratagems'],
                          [detachment.reference.enhancements, 'enhancements'],
                          [detachment.reference.upgrades, 'unit upgrades'],
                        ]
                          .flatMap(([count, label]) => (count ? [`${count} ${label}`] : []))
                          .join(' · ')}
                      </span>
                    ) : (
                      <span className="block text-xs text-dim">Reference details unavailable</span>
                    )}
                    {detachment.reference?.dispositions.length || detachment.points !== null ? (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {detachment.reference?.dispositions.map((disposition) => (
                          <span key={disposition} className={`chip ${dispositionTone(disposition)}`}>
                            {disposition}
                          </span>
                        ))}
                        {detachment.points == null ? null : <span className="chip text-info">{detachment.points} DP</span>}
                      </span>
                    ) : null}
                  </span>
                  {detachment.reference ? <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden /> : null}
                </>
              )
              return detachment.reference ? (
                <div key={detachment.id} className="flex items-center bg-panel pr-3 ring-1 ring-edge hover:bg-raised">
                  <FactionReferenceLink
                    to="/factions/$catalogueId/detachments/$detachmentId"
                    params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
                    className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2.5 pr-1 pl-3"
                  >
                    {content}
                  </FactionReferenceLink>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              ) : (
                <div key={detachment.id} className="flex items-center gap-1 bg-panel px-3 py-2.5 ring-1 ring-edge">
                  <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              )
            })}
          </div>
        </section>
        {faction.edition ? (
          <details className="group border border-edge bg-panel px-3 py-2">
            <summary className="rubric flex cursor-pointer items-center gap-2 hover:text-bone">
              <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              Rules history
            </summary>
            <p className="mt-2 text-sm text-dim">
              These dates record status changes in Praetorium; publisher release and effective dates can differ.
            </p>
            <ol className="mt-2 space-y-1 text-sm text-dim">
              {faction.edition.releases.map((release) => (
                <li key={release.at}>
                  {date(release.at)} ·{' '}
                  {release.status === 'preview'
                    ? 'Preview recorded'
                    : release.status === 'released'
                      ? 'Release recorded'
                      : 'Archive recorded'}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </PageContent>
    </main>
  )
}
