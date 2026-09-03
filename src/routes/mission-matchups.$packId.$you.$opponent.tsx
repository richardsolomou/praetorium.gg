import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { MapPinned } from 'lucide-react'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { MissionActions } from '../client/components/MissionActions'
import { MissionCardReference } from '../client/components/MissionCardReference'
import { TerrainBoard } from '../client/components/TerrainBoard'
import { TerrainLayoutDialogContent } from '../client/components/TerrainLayoutDialogContent'
import { PageState } from '../client/components/PageState'
import { type TerrainGeometry, type TerrainPiece, type TerrainTemplate } from '../client/components/terrainGeometry'
import { dispositionTone } from '../client/components/rosterSetup'
import { gameReferencesQuery, terrainMatchupIds, terrainReferencesQuery } from '../client/queries'

export const Route = createFileRoute('/mission-matchups/$packId/$you/$opponent')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(gameReferencesQuery())
    const pack = data?.packs.find((entry) => entry.id === params.packId)
    const valid = pack?.missions.some((mission) =>
      mission.matchups.some((pair) => pair[0]?.id === params.you && pair[1]?.id === params.opponent),
    )
    if (!valid) throw notFound()
    await context.queryClient.ensureQueryData(terrainReferencesQuery(terrainMatchupIds([params.you, params.opponent])))
  },
  component: MissionMatchupPage,
})

function MissionMatchupPage() {
  const { packId, you, opponent } = Route.useParams()
  const { data } = useQuery(gameReferencesQuery())
  const { data: terrain } = useQuery(terrainReferencesQuery(terrainMatchupIds([you, opponent])))
  const pack = data?.packs.find((entry) => entry.id === packId)
  const yours = pack?.missions.find((mission) => mission.matchups.some((pair) => pair[0]?.id === you && pair[1]?.id === opponent))
  const theirs = pack?.missions.find((mission) => mission.matchups.some((pair) => pair[0]?.id === opponent && pair[1]?.id === you))
  const yourDisposition = data?.dispositions.find((entry) => entry.id === you)
  const opponentDisposition = data?.dispositions.find((entry) => entry.id === opponent)
  const layouts = terrain?.layouts ?? []
  if (!data || !pack || !yours || !theirs || !yourDisposition || !opponentDisposition) return null
  // Each side keeps its own column, in the order the two missions are drawn above:
  // a matchup's two missions can ask for the same action, and an action shown under
  // the wrong side is worse than one a player has to look across the page for.
  const sides = [
    { seat: 'yours', mission: yours, disposition: yourDisposition },
    { seat: 'theirs', mission: theirs, disposition: opponentDisposition },
  ].map((side) => ({ ...side, actions: side.mission.card?.actions ?? [] }))

  return (
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <p className="eyebrow text-parchment">Mission matchup</p>
          <h1 className="mt-1 text-3xl">
            {yourDisposition.name} vs {opponentDisposition.name}
          </h1>
        </div>
      </section>
      <div className="mx-auto max-w-5xl px-3 pt-4 pb-8 sm:px-4">
        <Link to="/mission-packs/$packId" params={{ packId }} className="eyebrow text-info">
          {pack.name}
        </Link>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 border border-edge bg-sunken p-3">
          <div className={`grid min-h-14 place-items-center border px-3 text-center font-bold uppercase ${dispositionTone(you, true)}`}>
            {yourDisposition.name}
          </div>
          <span className="grid place-items-center text-sm font-bold text-dim">VS</span>
          <div
            className={`grid min-h-14 place-items-center border px-3 text-center font-bold uppercase ${dispositionTone(opponent, true)}`}
          >
            {opponentDisposition.name}
          </div>
        </div>

        <section className="mt-7">
          <h2 className="rubric border-b border-edge pb-2">Primary missions</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="border border-edge bg-panel p-4">
              <h3 className="text-xl">{yours.name}</h3>
              {yours.card ? <MissionCardReference card={yours.card} type={yourDisposition.name} /> : null}
            </div>
            <div className="border border-edge bg-panel p-4">
              <h3 className="text-xl">{theirs.name}</h3>
              {theirs.card ? <MissionCardReference card={theirs.card} type={opponentDisposition.name} /> : null}
            </div>
          </div>
        </section>

        {sides.some((side) => side.actions.length) ? (
          <section className="mt-7">
            <h2 className="rubric flex justify-between border-b border-edge pb-2">
              <span>Actions</span>
              <span className="readout">{sides.reduce((total, side) => total + side.actions.length, 0)}</span>
            </h2>
            <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
              {sides.map((side) => (
                <div key={side.seat} className="border border-edge bg-panel p-4">
                  <span className="chip">{side.disposition.name}</span>
                  {side.actions.length ? (
                    <MissionActions actions={side.actions} className="mt-4" />
                  ) : (
                    <p className="mt-4 text-sm text-dim">{side.mission.name} asks for no action.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-7">
          <h2 className="rubric flex justify-between border-b border-edge pb-2">
            <span>Terrain layouts</span>
            <span className="readout">{layouts.length}</span>
          </h2>
          {layouts.length ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {layouts.map((layout, index) => (
                <TerrainLayout
                  key={layout.id}
                  layout={layout}
                  deployment={data.deployments.find((entry) => entry.id === layout.deploymentId)}
                  templates={terrain?.templates ?? []}
                  label={String.fromCharCode(65 + index)}
                />
              ))}
            </div>
          ) : (
            <PageState
              className="mt-3"
              headingLevel={2}
              eyebrow="Terrain layouts"
              title="No layouts available"
              explanation="No terrain layout is available for this matchup."
              icon={MapPinned}
            />
          )}
        </section>
        <p className="mt-6 border-t border-edge pt-3 text-xs text-dim">{data.attribution}</p>
      </div>
    </main>
  )
}

function TerrainLayout({
  layout,
  deployment,
  templates,
  label,
}: {
  layout: {
    name: string
    description: string | null
    pieces: TerrainPiece[]
    geometry: TerrainGeometry | null
  }
  templates: TerrainTemplate[]
  deployment?: {
    name: string
    zones: { player: string; name: string; colour: string; points: { x: number; y: number }[] }[]
    objectives: { x: number; y: number }[]
  }
  label: string
}) {
  const description = deployment?.name ?? layout.description ?? layout.name

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group border border-edge bg-panel p-3 text-left transition-colors hover:border-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            aria-label={`Enlarge terrain layout ${label}: ${description}`}
          />
        }
      >
        <span className="block text-center text-lg font-bold">{label}</span>
        <TerrainBoard layout={layout} deployment={deployment} templates={templates} className="mt-2 w-full" />
        <span className="mt-2 block text-xs text-dim group-hover:text-bone">{description}</span>
      </DialogTrigger>
      <TerrainLayoutDialogContent
        title={`Layout ${label} · ${layout.name}`}
        description={description}
        layout={layout}
        deployment={deployment}
        templates={templates}
      />
    </Dialog>
  )
}
