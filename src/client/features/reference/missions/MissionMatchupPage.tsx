import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import { MapPinned, Maximize2 } from 'lucide-react'
import { BackLink } from '../BackLink'
import { Dialog, DialogTrigger } from '../../../components/Dialog'
import { MissionCardReference } from '../../../components/MissionCardReference'
import { TerrainBoard } from './TerrainBoard'
import { TerrainLayoutDialogContent } from './TerrainLayoutDialogContent'
import { PageState } from '../../../components/PageState'
import { type TerrainGeometry, type TerrainPiece, type TerrainTemplate } from './terrainGeometry'
import { DispositionChip } from '../../battle/setup/chrome'
import { gameReferencesQuery, terrainMatchupIds, terrainReferencesQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'
import { buttonClass } from '../../../components/buttonClass'
import { matchupMission } from '../../../../shared/gameReferences'
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
  const sides = [
    { seat: 'yours', mission: yours, disposition: yourDisposition },
    { seat: 'theirs', mission: theirs, disposition: opponentDisposition },
  ]

  return (
    <main className="w-full">
      <PageHeader
        title={`${yourDisposition.name} vs ${opponentDisposition.name}`}
        actions={
          <Link to="/rosters/new" search={{ reference: 'mission-matchup' }} className={buttonClass()}>
            Build a roster
          </Link>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
          {sides.map((side, at) => (
            <Fragment key={side.seat}>
              {at ? <span className="grid place-items-center font-display text-sm font-bold text-faint">VS</span> : null}
              <a
                href={`#mission-${side.mission.id}`}
                className={`flex min-h-16 min-w-0 flex-col justify-center gap-1.5 part px-3 py-2 transition-colors hover:border-runner-hi hover:bg-raised sm:px-4 ${at ? 'items-end text-right' : 'items-start text-left'}`}
              >
                <DispositionChip disposition={side.disposition} />
                <span className="font-display leading-tight font-bold tracking-heading break-words uppercase sm:text-lg">
                  {side.mission.name}
                </span>
              </a>
            </Fragment>
          ))}
        </div>
      </PageHeader>
      <PageContent className="space-y-6">
        <BackLink to="/missions/$packId" params={{ packId }}>
          {pack.name}
        </BackLink>
        {/*
         * Each side's actions sit in its own column under its own scoring: a matchup's two
         * missions can ask for the same action, and an action shown under the wrong side is
         * worse than one a player has to look across the page for.
         */}
        <div className="grid items-start gap-6 md:grid-cols-2">
          {sides.map((side) => (
            <section key={side.seat} id={`mission-${side.mission.id}`} className="scroll-mt-header space-y-3">
              <DispositionChip disposition={side.disposition} />
              <h2 className="text-xl sm:text-2xl">{side.mission.name}</h2>
              {side.mission.card ? <MissionCardReference card={side.mission.card} /> : null}
            </section>
          ))}
        </div>

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
              title="Loading terrain layouts"
              explanation="Layouts for this mission will be available shortly."
              icon={MapPinned}
            />
          ) : terrainQuery.isError ? (
            <PageState
              className="mt-3 min-h-64"
              headingLevel={2}
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
              className="group flex h-full w-full flex-col part p-3 text-left transition-colors hover:border-info focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
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
