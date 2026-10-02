import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TerrainBoard } from './TerrainBoard'
import { deploymentObjectiveMarkers, type TerrainGeometry, type TerrainPiece, type TerrainTemplate } from './terrainGeometry'

type Props = {
  title: string
  description: string
  layout: {
    name: string
    pieces: TerrainPiece[]
    geometry: TerrainGeometry | null
    publisherObjectiveUrl?: string
    publisherTerrainUrl?: string
    publisherUrl?: string
  }
  deployment?: {
    name: string
    zones: { player: string; name: string; colour: string; points: { x: number; y: number }[] }[]
    objectives: { x: number; y: number }[]
  }
  templates: TerrainTemplate[]
  ariaLabel?: string
}

/** The one full-size terrain inspection surface used during setup and in mission references. */
export function TerrainLayoutDialogContent({ title, description, layout, deployment, templates, ariaLabel }: Props) {
  const terrainObjectives = layout.geometry?.areas.some((area) => area.objective) ?? false
  const deploymentObjectives = deploymentObjectiveMarkers(layout.geometry, deployment?.objectives ?? [])
  const objectiveTerrain = terrainObjectives || deploymentObjectives.some((objective) => objective.kind === 'terrain')
  const objectiveMarkers = deploymentObjectives.some((objective) => objective.kind !== 'terrain')
  const measurements = layout.geometry?.areas.flatMap((area) => area.measurements) ?? []
  return (
    <DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-6xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
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
          <span className="h-1 w-4 bg-achieved" /> Dense terrain
        </span>
        <span className="flex items-center gap-2">
          <span className="h-1 w-4 bg-discarded" /> Light terrain
        </span>
        {objectiveTerrain ? (
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-full border border-bone bg-void" /> Objective terrain
          </span>
        ) : null}
        {objectiveMarkers ? (
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-full border border-bone bg-void" />{' '}
            {layout.geometry ? '40 mm objective marker · outside terrain' : '40 mm objective marker'}
          </span>
        ) : null}
        {measurements.some((measurement) => !measurement.approximate) ? (
          <span className="flex items-center gap-2">
            <span className="h-px w-4 bg-side-a" />
            {layout.publisherUrl ? 'Deployment depth' : 'Placement distance · nearest ⅛″'}
          </span>
        ) : null}
        {measurements.some((measurement) => measurement.approximate) ? (
          <span className="flex items-center gap-2">
            <span className="h-px w-4 bg-side-a" /> ≈ Approximate placement · nearest ⅛″
          </span>
        ) : null}
        <span>
          {layout.geometry ? `${layout.geometry.board.width}″ × ${layout.geometry.board.height}″ board · ` : ''}
          Grid: 1″ · heavier line every 5″
        </span>
      </div>
      {layout.publisherUrl && measurements.some((measurement) => measurement.approximate) ? (
        <p className="text-xs text-dim">
          Measure to the marked wall corners and objective centres. Keep the ruin walls parallel to the board edges.
        </p>
      ) : null}
      {!layout.publisherUrl && layout.geometry?.areas.some((area) => area.measurements.length > 2) ? (
        <p className="text-xs text-dim">
          For tilted terrain, match the two distances at the first marked corner, then the distance at the second corner.
        </p>
      ) : null}
      <TerrainBoard
        layout={layout}
        deployment={deployment}
        templates={templates}
        className="mx-auto w-full max-w-5xl"
        detailed
        ariaLabel={ariaLabel}
      />
      {layout.publisherObjectiveUrl && layout.publisherTerrainUrl ? (
        <p className="flex flex-wrap gap-4 text-sm text-info">
          <a href={layout.publisherObjectiveUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Publisher objective diagram
          </a>
          <a href={layout.publisherTerrainUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Publisher terrain diagram
          </a>
        </p>
      ) : null}
    </DialogContent>
  )
}
