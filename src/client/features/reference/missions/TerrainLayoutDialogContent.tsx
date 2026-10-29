import { Eye, Square, SquareCheck } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/Dialog'
import { measurementColours, type MeasurementSource, TerrainBoard } from './TerrainBoard'
import {
  deploymentObjectiveMarkers,
  terrainAreaJoins,
  type TerrainGeometry,
  type TerrainPiece,
  type TerrainTemplate,
} from './terrainGeometry'

const sources: string[] = ['terrain', 'lines', 'published', 'mat'] satisfies MeasurementSource[]

const pressed = 'data-[pressed]:bg-bone/10 data-[pressed]:text-bone'

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
    attackerTerritory?: { x: number; y: number }[] | null
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
  const joinedFootprints = layout.geometry ? terrainAreaJoins(layout.geometry).length > 0 : false
  const [show, setShow] = useState<MeasurementSource[]>(layout.geometry ? ['terrain', 'lines'] : ['published'])
  const placing = show.includes('terrain') || show.includes('lines')
  return (
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {layout.geometry ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs text-dim">Measure to</span>
            <ToggleGroup
              multiple
              value={show}
              onValueChange={(value) => {
                const shown = value.filter((source): source is MeasurementSource => sources.includes(source))
                posthog.capture('terrain_measurements_changed', { shown })
                setShow(shown)
              }}
              variant="outline"
              size="sm"
              className="flex-wrap"
              aria-label="Measurements to show"
            >
              <ToggleGroupItem value="terrain" className={cn(pressed, measurementColours.terrain.border)}>
                <Tick source="terrain" show={show} />
                Other terrain
              </ToggleGroupItem>
              {deployment?.zones.length ? (
                <ToggleGroupItem value="lines" className={cn(pressed, measurementColours.lines.border)}>
                  <Tick source="lines" show={show} />
                  Deployment lines
                </ToggleGroupItem>
              ) : null}
              <ToggleGroupItem value="published" className={cn(pressed, measurementColours.published.border)}>
                <Tick source="published" show={show} />
                Published distances
              </ToggleGroupItem>
              <ToggleGroupItem value="mat" className={cn(pressed, measurementColours.mat.border)}>
                <Tick source="mat" show={show} />
                Mat ruler
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        ) : null}
        {/* A grid row sizes a bare svg shorter than it draws, so the legend below would overlap the board's bottom edge. */}
        <div>
          <TerrainBoard
            layout={layout}
            deployment={deployment}
            templates={templates}
            className="mx-auto w-full max-w-5xl"
            detailed
            show={show}
            ariaLabel={ariaLabel}
          />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-edge py-2 text-xs text-dim">
          <span className="flex items-center gap-2">
            <span className="size-3 border border-azure bg-raised" /> Terrain area footprint
          </span>
          {joinedFootprints ? (
            <span className="flex items-center gap-2">
              <Eye className="size-3 text-bone" aria-hidden /> Footprints joined into one terrain area
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <span className="flex size-3 overflow-hidden border border-edge">
              <span className="w-1/2 bg-side-a/60" />
              <span className="w-1/2 bg-side-b/60" />
            </span>
            Deployment zones
          </span>
          {deployment?.attackerTerritory ? (
            <span className="flex items-center gap-2">
              <span className="flex size-3 overflow-hidden border border-edge">
                <span className="w-1/2 bg-side-a/30" />
                <span className="w-1/2 bg-side-b/30" />
              </span>
              Territories
            </span>
          ) : null}
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
          {placing ? (
            <span className="flex items-center gap-2">
              <span className="flex size-3 items-center justify-center rounded-full border border-bone bg-void text-[0.5rem] font-extrabold text-bone">
                1
              </span>
              Placement order · distance from the numbered corner, nearest ⅛″
            </span>
          ) : null}
          {placing ? (
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-measure-edges" /> Board edge distance · long ones read off the mat's edge ruler
            </span>
          ) : null}
          {show.includes('mat') ? (
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-measure-mat" /> Across from the left edge · up from the bottom edge
            </span>
          ) : null}
          {show.includes('published') && measurements.some((measurement) => !measurement.approximate) ? (
            <span className="flex items-center gap-2">
              <span className="h-px w-4 bg-measure-published" />
              {layout.publisherUrl ? 'Deployment depth' : 'Placement distance · nearest ⅛″'}
            </span>
          ) : null}
          {show.includes('published') && measurements.some((measurement) => measurement.approximate) ? (
            <span className="flex items-center gap-2">
              <span className="h-px w-4 bg-measure-published" /> ≈ Approximate placement · nearest ⅛″
            </span>
          ) : null}
          <span>
            {layout.geometry ? `${layout.geometry.board.width}″ × ${layout.geometry.board.height}″ board · ` : ''}
            Grid: 1″ · heavier line every 5″
          </span>
        </div>
        {placing ? (
          <p className="text-xs text-dim">
            Put the pieces down in numbered order, measuring each one square from its numbered corner. A tilted piece has one more distance
            at a second corner to set its angle.
          </p>
        ) : null}
        {show.includes('mat') ? (
          <p className="text-xs text-dim">
            Read each pair off a mat with printed inch marks: find the first number along the bottom edge and the second up the left edge,
            then place the marked corner or objective where they cross.
          </p>
        ) : null}
        {show.includes('published') && layout.publisherUrl && measurements.some((measurement) => measurement.approximate) ? (
          <p className="text-xs text-dim">
            Measure to the marked wall corners and objective centres. Keep the ruin walls parallel to the board edges.
          </p>
        ) : null}
        {show.includes('published') && !layout.publisherUrl && layout.geometry?.areas.some((area) => area.measurements.length > 2) ? (
          <p className="text-xs text-dim">
            For tilted terrain, match the two distances at the first marked corner, then the distance at the second corner.
          </p>
        ) : null}
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
      </DialogBody>
    </DialogContent>
  )
}

/** Ticked boxes take their option's colour on the board, so the toggles double as its key. */
function Tick({ source, show }: { source: MeasurementSource; show: MeasurementSource[] }) {
  return show.includes(source) ? (
    <SquareCheck className={measurementColours[source].text} aria-hidden />
  ) : (
    <Square className="text-dim" aria-hidden />
  )
}
