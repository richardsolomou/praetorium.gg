import { useQuery } from '@tanstack/react-query'
import { Check, Maximize2, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { BattleView, Command } from '../../core/battle'
import {
  TerrainBoard,
  type TerrainGeometry,
  type TerrainPiece,
  type TerrainTemplate,
} from '../../routes/mission-matchups.$packId.$you.$opponent'
import { deploymentsQuery, gameReferencesQuery } from '../queries'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean; allowedIds?: string[] }
type Deployment = {
  id: string
  name: string
  description: string | null
  zones: { player: string; name: string; colour: string; points: { x: number; y: number }[] }[]
  objectives: { x: number; y: number }[]
}
type Terrain = {
  id: string
  name: string
  description: string | null
  pieces: TerrainPiece[]
  geometry: TerrainGeometry | null
}

export function Battlefield({ view, send, pending, allowedIds }: Props) {
  const { data: allPatterns } = useQuery(deploymentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const dispositions = view.players.map((player) => player.roster?.built?.disposition).filter((value): value is string => Boolean(value))
  const matchup = dispositions.length === 2 ? dispositions : view.settings.solo && dispositions[0] ? [dispositions[0], dispositions[0]] : []
  const matchupIds = new Set(matchup.length === 2 ? [`${matchup[0]}-vs-${matchup[1]}`, `${matchup[1]}-vs-${matchup[0]}`] : [])
  const options =
    references?.terrainLayouts.flatMap((terrain) => {
      const deployment = allPatterns?.find((pattern) => pattern.id === terrain.deploymentId)
      if (!matchupIds.has(terrain.matchupId) || !deployment || (allowedIds?.length && !allowedIds.includes(deployment.id))) return []
      return [{ terrain, deployment }]
    }) ?? []
  const available = options.filter((option) => option.terrain.geometry)

  if (!matchup.length) return <p className="text-sm text-dim">Both armies determine the three deployment and terrain layouts.</p>
  if (!options.length) return <p className="text-sm text-dim">No combined battlefield layouts match these armies and mission.</p>

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-dim">Choose one layout. Each option includes its deployment zones and exact terrain setup.</p>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !available.length}
          onClick={() => {
            const option = available[Math.floor(Math.random() * available.length)]
            if (option) send({ kind: 'set-battlefield', patternId: option.deployment.id, terrainLayoutId: option.terrain.id })
          }}
        >
          <Shuffle /> Select random
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {options.map(({ terrain, deployment }, index) => {
          const selected = view.settings.terrainLayoutId === terrain.id && view.deploymentId === deployment.id
          const label = String.fromCharCode(65 + index)
          return (
            <button
              key={terrain.id}
              type="button"
              disabled={pending || !terrain.geometry}
              aria-pressed={selected}
              aria-label={`${selected ? 'Selected' : 'Select'} layout ${label}: ${deployment.name}`}
              onClick={() => send({ kind: 'set-battlefield', patternId: deployment.id, terrainLayoutId: terrain.id })}
              className="group border border-edge bg-sunken p-2 text-left transition-colors enabled:hover:border-azure disabled:opacity-60 aria-pressed:border-azure aria-pressed:ring-1 aria-pressed:ring-azure"
            >
              <span className="block text-center text-lg font-bold">{label}</span>
              <TerrainBoard
                layout={terrain}
                deployment={deployment}
                templates={references?.terrainTemplates ?? []}
                className="mt-2 w-full"
                detailed
                ariaLabel={`Layout ${label}: ${deployment.name} battlefield with ${terrain.name}`}
              />
              <span className="mt-2 block text-xs font-bold uppercase text-bone">{deployment.name}</span>
              <span
                className={`mt-2 flex items-center justify-center gap-1 border-t border-edge pt-2 text-sm font-bold uppercase ${selected ? 'text-achieved' : 'text-azure'}`}
              >
                {selected ? <Check className="size-4" /> : null}
                {selected ? 'Selected' : terrain.geometry ? 'Select' : 'Terrain data syncing'}
              </span>
            </button>
          )
        })}
      </div>
      {options.some((option) => !option.terrain.geometry) ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Exact terrain labels and measurements are still syncing. Those layouts cannot be selected yet.
        </p>
      ) : null}
    </section>
  )
}

export function BattlefieldReference({
  deployment,
  terrain,
  templates,
  className,
}: {
  deployment: Deployment
  terrain?: Terrain
  templates: TerrainTemplate[]
  className?: string
}) {
  const layout = terrain ?? { name: deployment.name, pieces: [], geometry: null }
  const ariaLabel = `${deployment.name} battlefield${terrain ? ` with ${terrain.name}` : ''}`
  return (
    <Dialog>
      <figure className={className}>
        <DialogTrigger
          render={
            <button
              type="button"
              className="group block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
              aria-label={`Enlarge ${ariaLabel}`}
            />
          }
        >
          <TerrainBoard layout={layout} deployment={deployment} templates={templates} className="w-full" ariaLabel={ariaLabel} />
          <figcaption className="flex items-start justify-between gap-3 border-x border-b border-edge bg-panel px-3 py-2 text-xs">
            <span>
              <span className="block font-bold uppercase text-bone">{terrain?.name ?? deployment.name}</span>
              <span className="mt-0.5 block text-dim">{deployment.description ?? deployment.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-dim group-hover:text-bone">
              <Maximize2 className="size-3" /> 44×60″
            </span>
          </figcaption>
        </DialogTrigger>
      </figure>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-none border border-edge bg-panel p-4 text-bone ring-0 sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{terrain?.name ?? deployment.name}</DialogTitle>
          <DialogDescription>{deployment.description ?? deployment.name}</DialogDescription>
        </DialogHeader>
        <BattlefieldLegend />
        <TerrainBoard
          layout={layout}
          deployment={deployment}
          templates={templates}
          className="mx-auto w-full max-w-5xl"
          detailed
          ariaLabel={ariaLabel}
        />
        {terrain && !terrain.geometry ? (
          <p role="alert" className="border border-destructive/60 bg-destructive/10 p-3 text-sm text-bone">
            Exact terrain labels and measurements are unavailable while the pinned terrain source is syncing.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BattlefieldLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-edge py-2 text-xs text-dim">
      <span className="flex items-center gap-2">
        <span className="size-3 border border-azure bg-raised" /> Terrain area footprint
      </span>
      <span className="flex items-center gap-2">
        <span className="flex size-3 overflow-hidden border border-edge">
          <span className="w-1/2 bg-side-a/60" />
          <span className="w-1/2 bg-side-b/60" />
        </span>
        Deployment zones
      </span>
      <span className="flex items-center gap-2">
        <span className="h-1 w-4 bg-discarded" /> Physical terrain
      </span>
      <span className="flex items-center gap-2">
        <span className="size-3 rounded-full border border-bone bg-void" /> Objective
      </span>
      <span className="flex items-center gap-2">
        <span className="h-px w-4 bg-side-a" /> Setup distance
      </span>
      <span>Grid: 1″ · heavier line every 5″</span>
    </div>
  )
}
