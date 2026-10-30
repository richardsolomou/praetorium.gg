import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import { MapPinned, Maximize2 } from 'lucide-react'
import { Dialog, DialogTrigger } from '../../../components/Dialog'
import { MissionActions } from '../../../components/MissionActions'
import { MissionCardReference } from '../../../components/MissionCardReference'
import { TerrainBoard } from './TerrainBoard'
import { TerrainLayoutDialogContent } from './TerrainLayoutDialogContent'
import { PageState } from '../../../components/PageState'
import { type TerrainGeometry, type TerrainPiece, type TerrainTemplate } from './terrainGeometry'
import { dispositionAccent, dispositionTone } from '../../../components/rosterSetup'
import { gameReferencesQuery, terrainMatchupIds, terrainReferencesQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'
import { buttonClass } from '../../../components/buttonClass'
import { matchupMission } from './dispositionMatchups'
import { SectionHeading } from '../../../components/SectionHeading'

export function MissionMatchupPage({ packId, you, opponent }: { packId: string; you: string; opponent: string }) {
  const { data } = useQuery(gameReferencesQuery())
  const terrainQuery = useQuery(terrainReferencesQuery(terrainMatchupIds([you, opponent])))
  const terrain = terrainQuery.data
  const pack = data?.packs.find((entry) => entry.id === packId)
  const yours = pack && matchupMission(pack, you, opponent)
  const theirs = pack && matchupMission(pack, opponent, you)
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
      <PageHeader
        eyebrow={
          <>
            Mission matchup ·{' '}
            <Link to="/missions/$packId" params={{ packId }} className="text-info hover:text-bone">
              {pack.name}
            </Link>
          </>
        }
        title={`${yourDisposition.name} vs ${opponentDisposition.name}`}
        actions={
          <Link to="/rosters/new" search={{ reference: 'mission-matchup' }} className={buttonClass()}>
            Build a roster
          </Link>
        }
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
          {sides.map((side, at) => (
            <Fragment key={side.seat}>
              {at ? <span className="grid place-items-center px-1 text-sm font-bold text-dim">VS</span> : null}
              <a
                href={`#mission-${side.mission.id}`}
                className={`flex min-h-16 min-w-0 flex-col justify-center border px-3 py-2 transition-colors hover:border-info hover:bg-raised focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none sm:px-4 ${at ? 'items-end text-right' : 'items-start text-left'} ${dispositionTone(side.disposition.id, true)}`}
              >
                <span className="eyebrow text-bone/75">{side.disposition.name}</span>
                <span className="mt-0.5 font-bold break-words sm:text-lg">{side.mission.name}</span>
              </a>
            </Fragment>
          ))}
        </div>
      </PageHeader>
      <PageContent className="space-y-6">
        <section>
          <SectionHeading title="Primary missions" />
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {sides.map((side) => (
              <div
                key={side.seat}
                id={`mission-${side.mission.id}`}
                className={`scroll-mt-header border-t-[3px] pt-3 ${dispositionAccent(side.disposition.id)}`}
              >
                <h3 className="text-xl">{side.mission.name}</h3>
                {side.mission.card ? (
                  <div className="mt-3">
                    <MissionCardReference card={side.mission.card} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {sides.some((side) => side.actions.length) ? (
          <section aria-label="Actions">
            <SectionHeading title="Actions" count={sides.reduce((total, side) => total + side.actions.length, 0)} />
            <div className="mt-4 grid items-start gap-6 md:grid-cols-2">
              {sides.map((side) => (
                <div
                  key={side.seat}
                  className={
                    side.actions.length
                      ? `border-t-[3px] pt-3 ${dispositionAccent(side.disposition.id)}`
                      : 'border-t-[3px] border-transparent pt-3'
                  }
                >
                  <span className={`chip ${dispositionTone(side.disposition.id)}`}>{side.disposition.name}</span>
                  {side.actions.length ? (
                    <MissionActions actions={side.actions} className="mt-4" />
                  ) : (
                    <p className="mt-3 text-sm text-dim">{side.mission.name} asks for no action.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <SectionHeading
            title="Terrain layouts"
            detail={
              <span className="readout" aria-label={terrainQuery.isPending ? 'Loading terrain layout count' : undefined}>
                {terrainQuery.isPending ? '…' : terrainQuery.isError ? '—' : layouts.length}
              </span>
            }
          />
          {terrainQuery.isPending ? (
            <PageState
              className="mt-3 min-h-64"
              headingLevel={2}
              loading
              eyebrow="Terrain layouts"
              title="Loading terrain layouts"
              explanation="Layouts for this mission will be available shortly."
              icon={MapPinned}
            />
          ) : terrainQuery.isError ? (
            <PageState
              className="mt-3 min-h-64"
              headingLevel={2}
              eyebrow="Terrain layouts"
              title="Terrain layouts unavailable"
              explanation="The layouts could not be loaded. Try again shortly."
              icon={MapPinned}
            />
          ) : layouts.length ? (
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
      </PageContent>
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
    id: string
    name: string
    description: string | null
    pieces: TerrainPiece[]
    geometry: TerrainGeometry | null
  }
  templates: TerrainTemplate[]
  deployment?: {
    id: string
    name: string
    zones: { player: string; name: string; colour: string; points: { x: number; y: number }[] }[]
    objectives: { x: number; y: number }[]
  }
  label: string
}) {
  const description = deployment?.name ?? layout.description ?? layout.name

  return (
    <div id={`terrain-${layout.id}`} className="h-full scroll-mt-header">
      {deployment ? <span id={`deployment-${deployment.id}`} className="block scroll-mt-header" /> : null}
      <Dialog>
        <DialogTrigger
          render={
            <button
              type="button"
              className="group flex h-full w-full flex-col border border-edge bg-panel p-3 text-left transition-colors hover:border-info focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
              aria-label={`Enlarge terrain layout ${label}: ${description}`}
            />
          }
        >
          <span className="flex items-center gap-2">
            <span className="text-lg font-bold">{label}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-dim transition-colors group-hover:text-bone">{description}</span>
            <Maximize2 className="size-4 shrink-0 text-dim transition-colors group-hover:text-info" aria-hidden />
          </span>
          <TerrainBoard layout={layout} deployment={deployment} templates={templates} className="mt-2 w-full" />
        </DialogTrigger>
        <TerrainLayoutDialogContent
          title={`Layout ${label} · ${layout.name}`}
          description={description}
          layout={layout}
          deployment={deployment}
          templates={templates}
        />
      </Dialog>
    </div>
  )
}
