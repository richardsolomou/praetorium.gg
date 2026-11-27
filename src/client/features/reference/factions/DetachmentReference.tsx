import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { routeSlug } from '../../../../core/slug'
import { detachmentDetailQuery } from '../../../queries'
import { RuleText, SummaryById } from '../../../components/RuleText'
import type { KeywordRule } from '../../../components/Keyword'
import { stratagemWindowsLabel } from '../../../../core/reminders'
import { DatasheetUnit, detachmentRulesOwner, useVsDataSummaries } from '../../../components/UnitFromVsData'
import { dispositionTag } from '../../../components/rosterSetup'
import { FactionMark, factionColour, type FactionPresentation } from '../../../components/FactionMark'
import { FavouriteDetachmentToggle } from './FavouriteDetachmentToggle'
import { PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'
import { title } from '../../../missionText'
import { SectionHeading } from '../../../components/SectionHeading'

export function DetachmentReference({
  catalogueId,
  slug,
  detachmentId,
  faction,
  action,
  afterHero,
  closing,
}: {
  catalogueId: string
  slug: string
  detachmentId?: string
  faction?: FactionPresentation
  /** The page's way into the builder, beside the detachment's own chips. */
  action?: ReactNode
  afterHero?: ReactNode
  /** What the page ends on, once the detachment has been read. */
  closing?: ReactNode
}) {
  const { data: detachment, isPending, isError } = useQuery(detachmentDetailQuery(catalogueId, slug))
  const summaryOf = useVsDataSummaries(catalogueId, detachment?.stratagems.map((stratagem) => stratagem.id) ?? [])
  if (isPending)
    return (
      <PageState
        loading
        title="Loading detachment"
        explanation="Rules, enhancements, and stratagems will appear when the reference is ready."
      />
    )
  if (!detachment)
    return (
      <PageState
        title="Detachment reference unavailable"
        explanation={
          isError
            ? 'The reference could not be loaded. Try opening it again.'
            : 'The current catalogue has no reference details for this detachment.'
        }
      />
    )

  const owner = faction ? detachmentRulesOwner(catalogueId, faction.slug, slug) : null
  return (
    <DatasheetUnit.Provider value={owner}>
      <div id="summary">
        <PageHeader
          tint={faction ? factionColour(faction.slug, faction.displayName) : undefined}
          title={detachment.name}
          media={faction ? <FactionMark faction={faction} /> : undefined}
          actions={
            detachmentId || action ? (
              <div className="flex flex-wrap items-center gap-1">
                {detachmentId ? (
                  <FavouriteDetachmentToggle catalogueId={catalogueId} detachmentId={detachmentId} name={detachment.name} />
                ) : null}
                {action}
              </div>
            ) : null
          }
        >
          {detachment.dispositions.length || detachment.points !== null ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {detachment.dispositions.map((disposition) => (
                <Link
                  key={disposition}
                  to="/force-dispositions/$dispositionId"
                  params={{ dispositionId: routeSlug(disposition) }}
                  className={`${dispositionTag(disposition)} hover:text-bone`}
                >
                  {disposition}
                </Link>
              ))}
              {detachment.points === null ? null : <span className="text-sm text-dim">{detachment.points} DP</span>}
            </div>
          ) : null}
        </PageHeader>
        <div id="keyword-rules">
          <PageContent className="space-y-6">
            {afterHero}

            {detachment.rules.length ? (
              <section>
                <SectionHeading title="Detachment rules" count={detachment.rules.length} />
                <div className="border-t border-edge">
                  {detachment.rules.map((rule) => (
                    <article id={`rule-${routeSlug(rule.name)}`} key={rule.name} className={ENTRY}>
                      <h2 className="text-lg">{rule.name}</h2>
                      <CardSummary card={rule} catalogueId={catalogueId} rules={detachment.keywordRules} />
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <SectionHeading title="Enhancements" count={detachment.enhancements.length} />
              <div className={ENTRIES}>
                {!detachment.enhancements.length ? <p className="py-2 text-sm text-dim">No enhancement details are available.</p> : null}
                {detachment.enhancements.map((enhancement) => (
                  <article id={`enhancement-${routeSlug(enhancement.name)}`} key={enhancement.name} className={ENTRY}>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base">{enhancement.name}</h2>
                      {enhancement.points === null ? null : <Cost value={enhancement.points} unit="pts" />}
                    </div>
                    <CardSummary card={enhancement} catalogueId={catalogueId} rules={detachment.keywordRules} />
                  </article>
                ))}
              </div>
            </section>

            {detachment.upgrades.length ? (
              <section>
                <SectionHeading title="Unit upgrades" count={detachment.upgrades.length} />
                <div className={ENTRIES}>
                  {detachment.upgrades.map((upgrade) => (
                    <article id={`upgrade-${routeSlug(upgrade.name)}`} key={upgrade.name} className={ENTRY}>
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base">{upgrade.name}</h2>
                        {upgrade.points === null ? null : <Cost value={upgrade.points} unit="pts" />}
                      </div>
                      <CardSummary card={upgrade} catalogueId={catalogueId} rules={detachment.keywordRules} />
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section aria-label="Stratagems">
              <SectionHeading title="Stratagems" count={detachment.stratagems.length} />
              {detachment.stratagems.some((stratagem) => summaryOf(stratagem.id) === null) ? (
                <p className="text-sm text-dim">Some stratagem descriptions are not available.</p>
              ) : null}
              <div className={`mt-2 ${ENTRIES}`}>
                {!detachment.stratagems.length ? <p className="py-2 text-sm text-dim">No stratagem details are available.</p> : null}
                {detachment.stratagems.map((stratagem) => (
                  <article id={`stratagem-${routeSlug(stratagem.name)}`} key={stratagem.id} className={ENTRY}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base">{stratagem.name}</h2>
                        <p className="eyebrow mt-1">
                          {[
                            stratagem.type,
                            ...(stratagem.windows
                              ? [stratagemWindowsLabel(stratagem.windows)]
                              : [...stratagem.phases.map(title), stratagem.turn ? title(stratagem.turn) : null]),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      {stratagem.cp === null ? null : <Cost value={stratagem.cp} unit="CP" />}
                    </div>
                    <SummaryById catalogueId={catalogueId} id={stratagem.id} />
                  </article>
                ))}
              </div>
            </section>

            {closing}
          </PageContent>
        </div>
      </div>
    </DatasheetUnit.Provider>
  )
}

/** Rules, enhancements and stratagems are read, not chosen here, so each sits on a hairline rather than in a card. */
const ENTRIES = 'grid border-t border-edge md:grid-cols-2 md:gap-x-6'
const ENTRY = 'border-b border-edge py-4'

/** What a card costs, as the figure a roster prices it with and its unit beside it. */
function Cost({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="shrink-0 whitespace-nowrap">
      <span className="figure text-xl leading-none text-bone">{value}</span>
      <span className="ml-1 text-xs text-dim">{unit}</span>
    </span>
  )
}

function Unavailable() {
  return <p className="mt-2 text-sm text-dim">No description is available.</p>
}

/**
 * A detachment card's VS Data summary, by its VS Data id; a rule only BSData prints has none, and shows the summary of
 * the rule its text prints.
 */
function CardSummary({
  card,
  catalogueId,
  rules,
}: {
  card: { name: string; description: string | null; vsDataId?: string }
  catalogueId: string
  rules: KeywordRule[]
}) {
  if (card.vsDataId) return <SummaryById catalogueId={catalogueId} id={card.vsDataId} fallback={<Unavailable />} />
  return card.description ? <RuleText text={card.description} rules={rules} name={card.name} /> : <Unavailable />
}
