import { withArticle } from '../../../text'
import { RulesVersionLabel } from '../../../components/RulesVersionLabel'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { favouriteDetachmentsFirst, useFavouriteDetachments } from '../../../favouriteDetachments'
import { discoveredRostersQuery, factionIndexQuery, factionQuery } from '../../../queries'
import { FavouriteDetachmentToggle } from './FavouriteDetachmentToggle'
import { FavouriteFactionToggle } from './FavouriteFactionToggle'
import { FactionMark, factionColour } from '../../../components/FactionMark'
import { dispositionTag } from '../../../components/rosterSetup'
import { RuleText } from '../../../components/RuleText'
import { DatasheetUnit, factionRulesOwner } from '../../../components/UnitFromVsData'
import { routeSlug } from '../../../../core/slug'
import { PageContent, PageHeader } from '../../../components/Page'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { rulesVersionLabel } from '../../../../core/catalogueEdition'
import { currentCatalogueFamilyId } from '../../../../core/retiredCatalogueIds'
import { useDateFormatting } from '../../../dates'
import { factionReferenceHref } from '../../../../core/factionReferenceRoute'
import { StartRoster } from '../../rosters/ReferenceRosterActions'
import { SectionHeading } from '../../../components/SectionHeading'
import { BackLink } from '../BackLink'
import { FactionGames } from './FactionGames'
import { NextStep } from '../NextStep'
import { ContinueGuestDraft } from '../../rosters/ContinueGuestDraft'
import { DisclosureChevron } from '../../../components/DisclosureChevron'

/** One figure of the faction's reference, a cell of the ruled strip under the header. */
const STAT_LINK =
  'flex min-h-16 flex-col justify-between gap-1.5 px-2 py-2.5 transition-colors hover:bg-raised sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3'

export function FactionPage({ catalogueId }: { catalogueId: string }) {
  const { data: faction } = useQuery(factionQuery(catalogueId))
  const { data: index } = useQuery(factionIndexQuery())
  const navigate = useNavigate()
  const { date } = useDateFormatting()
  const { favourites } = useFavouriteDetachments()
  // The rosters page asks for exactly this filter and order, so following the link reuses the answer.
  const { data: publicRosters } = useInfiniteQuery({
    ...discoveredRostersQuery(
      { faction: { in: [faction ? currentCatalogueFamilyId(faction.id) : ''], out: [] } },
      'public',
      'updated-desc',
    ),
    enabled: Boolean(faction),
  })
  const publicArmies = publicRosters?.pages[0]?.total ?? null
  if (!faction) return null
  const editions = index?.factions.filter((entry) => currentCatalogueFamilyId(entry.id) === currentCatalogueFamilyId(faction.id)) ?? []
  editions.sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
  const reference = faction.references[0]
  const pageActions = (
    <div className="flex items-center gap-1">
      {faction.detachments.length || faction.withoutDetachments ? <StartRoster faction={faction} /> : null}
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
        <BackLink to="/factions">Factions</BackLink>
        <ContinueGuestDraft surface="faction" />
        <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))] divide-x divide-edge border-y border-edge">
          <FactionReferenceLink to="/factions/$catalogueId/datasheets" params={{ catalogueId: faction.slug }} className={STAT_LINK}>
            <span className="eyebrow">Datasheets</span>
            <span className="flex items-center gap-2">
              <span className="figure text-2xl leading-none text-bone sm:text-3xl">{reference?.datasheets ?? 0}</span>
              <ChevronRight className="size-4 text-faint" aria-hidden />
            </span>
          </FactionReferenceLink>
          <Link to="/rosters" search={{ view: 'public', faction: faction.slug }} className={STAT_LINK}>
            <span className="eyebrow">Public armies</span>
            <span className="flex items-center gap-2">
              {publicArmies === null ? null : <span className="figure text-2xl leading-none text-bone sm:text-3xl">{publicArmies}</span>}
              <ChevronRight className="size-4 text-faint" aria-hidden />
            </span>
          </Link>
          <Link to="/data-updates/$catalogueId" params={{ catalogueId: faction.slug }} search={{}} className={STAT_LINK}>
            <span className="eyebrow">Data updates</span>
            <ChevronRight className="size-4 text-faint" aria-hidden />
          </Link>
        </section>
        {faction.armyRules.length ? <FactionAbilities faction={faction} rules={faction.armyRules} /> : null}
        <section aria-label="Detachments">
          <SectionHeading title="Detachments" count={detachments.length} />
          {faction.withoutDetachments ? (
            <p className="py-2 text-sm text-dim">This army takes no detachment.</p>
          ) : !detachments.length ? (
            <p className="py-2 text-sm text-dim">No detachment rules are available for this faction.</p>
          ) : null}
          <div className="grid md:grid-cols-2 md:gap-x-6">
            {detachments.map((detachment) => {
              const content = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-bold text-bone">{detachment.name}</span>
                    {detachment.reference ? (
                      <span className="block text-2xs text-faint">
                        {[
                          [detachment.reference.stratagems, 'stratagems'],
                          [detachment.reference.enhancements, 'enhancements'],
                          [detachment.reference.upgrades, 'unit upgrades'],
                        ]
                          .flatMap(([count, label]) => (count ? [`${count} ${label}`] : []))
                          .join(' · ')}
                      </span>
                    ) : (
                      <span className="block text-2xs text-faint">Reference details unavailable</span>
                    )}
                    {detachment.reference?.dispositions.length || detachment.points !== null ? (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {detachment.reference?.dispositions.map((disposition) => (
                          <span key={disposition} className={dispositionTag(disposition)}>
                            {disposition}
                          </span>
                        ))}
                        {detachment.points == null ? null : (
                          <span className="readout text-2xs font-semibold text-dim">{detachment.points} DP</span>
                        )}
                      </span>
                    ) : null}
                  </span>
                  {detachment.reference ? <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden /> : null}
                </>
              )
              return detachment.reference ? (
                <div key={detachment.id} className="flex items-center border-t border-edge pr-1 transition-colors hover:bg-raised">
                  <FactionReferenceLink
                    to="/factions/$catalogueId/detachments/$detachmentId"
                    params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
                    className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2.5 pr-1 pl-2"
                  >
                    {content}
                  </FactionReferenceLink>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              ) : (
                <div key={detachment.id} className="flex items-center gap-1 border-t border-edge py-2.5 pr-1 pl-2">
                  <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
                  <FavouriteDetachmentToggle catalogueId={faction.id} detachmentId={detachment.id} name={detachment.name} />
                </div>
              )
            })}
          </div>
        </section>
        <FactionGames faction={faction} />
        {faction.edition ? (
          <details className="group border-y border-edge px-2 py-3">
            <summary className="rubric flex cursor-pointer items-center gap-2 hover:text-bone">
              <DisclosureChevron />
              Rules history
            </summary>
            <p className="mt-2 text-sm text-dim">
              These dates record status changes in Praetorium; publisher release and effective dates can differ.
            </p>
            <ol className="mt-3 runner gap-1.5 text-sm text-dim">
              {faction.edition.releases.map((release) => (
                <li key={release.at}>
                  <span className="readout font-semibold text-bone">{date(release.at)}</span> ·{' '}
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
        {faction.detachments.length || faction.withoutDetachments ? (
          <NextStep
            title={`Build ${withArticle(faction.displayName)} list`}
            description="Your faction is already filled in."
            action={<StartRoster faction={faction} closing />}
          />
        ) : null}
      </PageContent>
    </main>
  )
}

/** A faction's army rules, each read as the faction's own: the VS Data record its faction holds of the name. */
export function FactionAbilities({
  faction,
  rules,
}: {
  faction: { id: string; displayName: string }
  rules: readonly { name: string; description: string }[]
}) {
  const owner = factionRulesOwner(faction.id, routeSlug(faction.displayName))
  return (
    <DatasheetUnit.Provider value={owner}>
      <section>
        <SectionHeading title="Faction abilities" />
        <div className="divide-y divide-edge border-y border-edge">
          {rules.map((rule) => (
            <details key={rule.name} className="group">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-2 py-2.5 hover:bg-raised">
                <DisclosureChevron />
                <h3 className="min-w-0 flex-1 text-base">{rule.name}</h3>
              </summary>
              <RuleText text={rule.description} name={rule.name} className="px-2 pb-3" />
            </details>
          ))}
        </div>
      </section>
    </DatasheetUnit.Provider>
  )
}
