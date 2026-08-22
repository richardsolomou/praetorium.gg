import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TerrainBoard } from './TerrainBoard'
import type { TerrainGeometry, TerrainPiece, TerrainTemplate } from './terrainGeometry'

type Props = {
  title: string
  description: string
  layout: { name: string; pieces: TerrainPiece[]; geometry: TerrainGeometry | null }
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
  return (
    <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-none border border-edge bg-panel p-4 text-bone ring-0 sm:max-w-6xl">
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
      <TerrainBoard
        layout={layout}
        deployment={deployment}
        templates={templates}
        className="mx-auto w-full max-w-5xl"
        detailed
        ariaLabel={ariaLabel}
      />
    </DialogContent>
  )
}
