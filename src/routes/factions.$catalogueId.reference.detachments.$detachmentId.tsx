import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useParams } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { factionFor } from '../client/factions'
import { detachmentDetailQuery, factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/detachments/$detachmentId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    const faction = factionFor(data, params.catalogueId)
    if (!faction || !(await context.queryClient.ensureQueryData(detachmentDetailQuery(faction.id, params.detachmentId)))) {
      throw notFound()
    }
  },
  component: DetachmentPage,
})

export function DetachmentPage() {
  const params = useParams({ strict: false })
  const { data } = useQuery(factionsQuery())
  const faction = factionFor(data, params.catalogueId ?? '')
  const { data: detachment } = useQuery(detachmentDetailQuery(faction?.id ?? '', params.detachmentId ?? ''))
  if (!faction || !detachment) return null

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <nav aria-label="Breadcrumb" className="eyebrow flex flex-wrap items-center gap-1 text-azure">
        <Link to="/factions">Factions</Link>
        <ChevronRight className="size-3 text-dim" aria-hidden />
        <Link to="/factions/$catalogueId" params={{ catalogueId: faction.slug }}>
          {faction.displayName}
        </Link>
        <ChevronRight className="size-3 text-dim" aria-hidden />
        <span className="text-dim">Detachments</span>
      </nav>

      <header className="border-b border-edge pb-4">
        <p className="eyebrow">Detachment</p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl">{detachment.name}</h1>
          {detachment.points === null ? null : <span className="chip shrink-0">{detachment.points} DP</span>}
        </div>
        {detachment.dispositions.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {detachment.dispositions.map((disposition) => (
              <span key={disposition} className="chip">
                {disposition}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {detachment.rule ? (
        <section>
          <SectionTitle title="Detachment rule" count={1} />
          <article className="mt-2 border border-edge bg-panel p-4">
            <h2 className="text-lg">{detachment.rule.name}</h2>
            {detachment.rule.description ? <RuleText text={detachment.rule.description} /> : <Unavailable />}
          </article>
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
              {enhancement.description ? <RuleText text={enhancement.description} /> : <Unavailable />}
            </article>
          ))}
        </div>
      </section>

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
              {stratagem.description ? <RuleText text={stratagem.description} /> : null}
            </article>
          ))}
        </div>
      </section>

      <p className="border-t border-edge pt-3 text-xs text-dim">{detachment.attribution}</p>
    </main>
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

function RuleText({ text }: { text: string }) {
  return <p className="mt-2 text-sm whitespace-pre-line text-dim">{text.replaceAll(/\^\^|\*\*/g, '')}</p>
}

function Unavailable() {
  return <p className="mt-2 text-sm text-dim">No description is available from the synced sources.</p>
}

const title = (value: string) => value.replaceAll('-', ' ').replaceAll(/\b\w/g, (letter) => letter.toLocaleUpperCase())
