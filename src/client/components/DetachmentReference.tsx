import { useQuery } from '@tanstack/react-query'
import { detachmentDetailQuery } from '../queries'
import { RuleText } from './RuleText'
import { dispositionTone } from './rosterSetup'
import { FactionMark, factionColour, type FactionPresentation } from './FactionMark'

export function DetachmentReference({ catalogueId, slug, faction }: { catalogueId: string; slug: string; faction?: FactionPresentation }) {
  const { data: detachment } = useQuery(detachmentDetailQuery(catalogueId, slug))
  if (!detachment) return <p className="p-6 text-sm text-dim">Loading detachment…</p>

  return (
    <div className="space-y-6">
      <header
        className="flex items-start gap-3 border-b pb-4"
        style={{ borderBottomColor: faction ? factionColour(faction.slug) : undefined }}
      >
        {faction ? <FactionMark id={faction.slug} icon={faction.icon} /> : null}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{faction ? `${faction.displayName} · Detachment` : 'Detachment'}</p>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl">{detachment.name}</h1>
            {detachment.dispositions.length || detachment.points !== null ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-1 pt-1">
                {detachment.dispositions.map((disposition) => (
                  <span key={disposition} className={`chip ${dispositionTone(disposition)}`}>
                    {disposition}
                  </span>
                ))}
                {detachment.points === null ? null : <span className="chip">{detachment.points} DP</span>}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {detachment.rules.length ? (
        <section>
          <SectionTitle title="Detachment rules" count={detachment.rules.length} />
          <div className="mt-2 grid gap-2">
            {detachment.rules.map((rule) => (
              <article key={rule.name} className="border border-edge bg-panel p-4">
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
          {detachment.enhancements.map((enhancement) => (
            <article key={enhancement.name} className="border border-edge bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base">{enhancement.name}</h2>
                {enhancement.points === null ? null : <span className="chip shrink-0">{enhancement.points} pts</span>}
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
              <article key={upgrade.name} className="border border-edge bg-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base">{upgrade.name}</h2>
                  {upgrade.points === null ? null : <span className="chip shrink-0">{upgrade.points} pts</span>}
                </div>
                {upgrade.description ? <RuleText text={upgrade.description} rules={detachment.keywordRules} /> : <Unavailable />}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle title="Stratagems" count={detachment.stratagems.length} />
        {detachment.stratagems.some((stratagem) => !stratagem.description) ? (
          <p className="mt-2 text-sm text-dim">Some stratagem descriptions are unavailable from the synced sources.</p>
        ) : null}
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {detachment.stratagems.map((stratagem) => (
            <article key={stratagem.id} className="border border-edge bg-panel p-4">
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

      <p className="border-t border-edge pt-3 text-xs text-dim">{detachment.attribution}</p>
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
  return <p className="mt-2 text-sm text-dim">No description is available from the synced sources.</p>
}

const title = (value: string) => value.replaceAll('-', ' ').replaceAll(/\b\w/g, (letter) => letter.toLocaleUpperCase())
