import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { routeSlug } from '../../../../core/slug'
import { detachmentDetailQuery } from '../../../queries'
import { RuleText } from '../../../components/RuleText'
import { dispositionTone } from '../../../components/rosterSetup'
import { FactionMark, factionColour, type FactionPresentation } from '../../../components/FactionMark'
import { FavouriteDetachmentToggle } from './FavouriteDetachmentToggle'
import { PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'
import { title } from '../../../missionText'

export function DetachmentReference({
  catalogueId,
  slug,
  detachmentId,
  faction,
  action,
  afterHero,
}: {
  catalogueId: string
  slug: string
  detachmentId?: string
  faction?: FactionPresentation
  /** The page's way into the builder, beside the detachment's own chips. */
  action?: ReactNode
  afterHero?: ReactNode
}) {
  const { data: detachment, isPending, isError } = useQuery(detachmentDetailQuery(catalogueId, slug))
  if (isPending)
    return (
      <PageState
        loading
        eyebrow={faction?.displayName ?? 'Detachment'}
        title="Loading detachment"
        explanation="Rules, enhancements, and stratagems will appear when the reference is ready."
      />
    )
  if (!detachment)
    return (
      <PageState
        eyebrow={faction?.displayName ?? 'Detachment'}
        title="Detachment reference unavailable"
        explanation={
          isError
            ? 'The reference could not be loaded. Try opening it again.'
            : 'The current catalogue has no reference details for this detachment.'
        }
      />
    )

  return (
    <div id="summary">
      <PageHeader
        tint={faction ? factionColour(faction.slug, faction.displayName) : undefined}
        eyebrow={faction ? `${faction.displayName} · Detachment` : 'Detachment'}
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
          <div className="flex flex-wrap gap-1">
            {detachment.dispositions.map((disposition) => (
              <Link
                key={disposition}
                to="/force-dispositions/$dispositionId"
                params={{ dispositionId: routeSlug(disposition) }}
                className={`chip hover:text-bone ${dispositionTone(disposition)}`}
              >
                {disposition}
              </Link>
            ))}
            {detachment.points === null ? null : <span className="chip text-info">{detachment.points} DP</span>}
          </div>
        ) : null}
      </PageHeader>
      <div id="keyword-rules">
        <PageContent className="space-y-6">
          {afterHero}

          {detachment.rules.length ? (
            <section>
              <SectionTitle title="Detachment rules" count={detachment.rules.length} />
              <div className="mt-2 grid gap-2">
                {detachment.rules.map((rule) => (
                  <article id={`rule-${routeSlug(rule.name)}`} key={rule.name} className="border border-edge bg-panel p-4">
                    <h2 className="text-lg">{rule.name}</h2>
                    {rule.description ? <RuleText text={rule.description} rules={detachment.keywordRules} /> : <Unavailable />}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionTitle title="Enhancements" count={detachment.enhancements.length} />
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {!detachment.enhancements.length ? <p className="py-2 text-sm text-dim">No enhancement details are available.</p> : null}
              {detachment.enhancements.map((enhancement) => (
                <article
                  id={`enhancement-${routeSlug(enhancement.name)}`}
                  key={enhancement.name}
                  className="border border-edge bg-panel p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base">{enhancement.name}</h2>
                    {enhancement.points === null ? null : <span className="chip shrink-0 text-info">{enhancement.points} pts</span>}
                  </div>
                  {enhancement.description ? <RuleText text={enhancement.description} rules={detachment.keywordRules} /> : <Unavailable />}
                </article>
              ))}
            </div>
          </section>

          {detachment.upgrades.length ? (
            <section>
              <SectionTitle title="Unit upgrades" count={detachment.upgrades.length} />
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {detachment.upgrades.map((upgrade) => (
                  <article id={`upgrade-${routeSlug(upgrade.name)}`} key={upgrade.name} className="border border-edge bg-panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base">{upgrade.name}</h2>
                      {upgrade.points === null ? null : <span className="chip shrink-0 text-info">{upgrade.points} pts</span>}
                    </div>
                    {upgrade.description ? <RuleText text={upgrade.description} rules={detachment.keywordRules} /> : <Unavailable />}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-label="Stratagems">
            <SectionTitle title="Stratagems" count={detachment.stratagems.length} />
            {detachment.stratagems.some((stratagem) => !stratagem.description) ? (
              <p className="mt-2 text-sm text-dim">Some stratagem descriptions are not available.</p>
            ) : null}
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {!detachment.stratagems.length ? <p className="py-2 text-sm text-dim">No stratagem details are available.</p> : null}
              {detachment.stratagems.map((stratagem) => (
                <article id={`stratagem-${routeSlug(stratagem.name)}`} key={stratagem.id} className="border border-edge bg-panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base">{stratagem.name}</h2>
                      <p className="eyebrow mt-1">
                        {[stratagem.type, ...stratagem.phases.map(title), stratagem.turn ? title(stratagem.turn) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="chip shrink-0">{stratagem.cp} CP</span>
                  </div>
                  {stratagem.description ? <RuleText text={stratagem.description} rules={detachment.keywordRules} /> : null}
                </article>
              ))}
            </div>
          </section>
        </PageContent>
      </div>
    </div>
  )
}

function SectionTitle({ title: label, count }: { title: string; count: number }) {
  return (
    <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
      <span>{label}</span>
      <span className="readout">{count}</span>
    </h2>
  )
}

function Unavailable() {
  return <p className="mt-2 text-sm text-dim">No description is available.</p>
}
