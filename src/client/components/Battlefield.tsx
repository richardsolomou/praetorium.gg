import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Eye, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { Command } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { deploymentsQuery, terrainMatchupIds, terrainReferencesQuery } from '../queries'
import { CHOOSABLE, CHOSEN } from './setup/chrome'
import { TerrainBoard } from './TerrainBoard'
import { TerrainLayoutDialogContent } from './TerrainLayoutDialogContent'

type Props = {
  view: BattleView
  send: (command: Command) => void
  pending: boolean
  allowedIds?: string[]
  /** The two dispositions these layouts are for, named the way the pack names them. */
  matchup?: string
}

export function Battlefield({ view, send, pending, allowedIds, matchup }: Props) {
  const [inspecting, setInspecting] = useState<string | null>(null)
  const { data: allPatterns } = useQuery(deploymentsQuery())
  // The card each side plays, as the domain folded it: an allied pair fields one army
  // and plays one card, so this is not the same as reading the first seat's list.
  const dispositions = [...new Set(view.players.map((player) => player.side))]
    .map((side) => view.players.find((player) => player.side === side)?.disposition)
    .filter((value): value is string => Boolean(value))
  const matchupIds = terrainMatchupIds(dispositions)
  const { data: references } = useQuery(terrainReferencesQuery(matchupIds))
  const options =
    references?.layouts.flatMap((terrain) => {
      const deployment = allPatterns?.find((pattern) => pattern.id === terrain.deploymentId)
      if (!deployment || (allowedIds?.length && !allowedIds.includes(deployment.id))) return []
      return [{ terrain, deployment }]
    }) ?? []
  const available = options.filter((option) => option.terrain.geometry)
  const inspected = options.find((option) => option.terrain.id === inspecting)

  if (!matchupIds.length) {
    const viewerRoster = view.players.find((player) => player.isViewer)?.roster
    if (viewerRoster && !viewerRoster.built?.disposition) {
      return (
        <p className="text-sm text-dim">
          Your army combines detachments with different Force Dispositions, so it needs one chosen before a battlefield can be picked.{' '}
          {viewerRoster.id ? (
            <Link to="/rosters/$id" params={{ id: viewerRoster.id }} className="text-info hover:text-bone">
              Choose one on the roster
            </Link>
          ) : (
            'Edit the roster to choose one.'
          )}
        </p>
      )
    }
    return <p className="text-sm text-dim">Both armies determine the three deployment and terrain layouts.</p>
  }
  if (!options.length) return <p className="text-sm text-dim">No combined battlefield layouts match these armies and mission.</p>

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Named like the panel above it, so the two questions the step asks look alike. */}
        <div className="min-w-0">
          <p className="eyebrow">Deployment and terrain layout</p>
          <p className="mt-0.5 max-w-2xl text-sm text-dim">
            Choose one layout{matchup ? ` for ${matchup}` : ''}. Each option includes its deployment zones and exact terrain setup.
          </p>
        </div>
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
            <article key={terrain.id} className={`flex flex-col border bg-sunken p-2 transition-colors ${selected ? CHOSEN : CHOOSABLE}`}>
              <span className="block text-center text-lg font-bold">{label}</span>
              {/* Taking a layout is the deliberate act, so it is the one button on the card. */}
              <Button
                variant={selected ? 'secondary' : 'outline'}
                className="mt-2 w-full"
                disabled={!terrain.geometry}
                aria-label={`${selected ? 'Selected' : 'Select'} layout ${label}: ${deployment.name}`}
                onClick={() => {
                  if (!pending) send({ kind: 'set-battlefield', patternId: deployment.id, terrainLayoutId: terrain.id })
                }}
              >
                {selected ? <Check /> : null}
                {selected ? 'Selected' : terrain.geometry ? 'Select' : 'Loading'}
              </Button>
              {/*
               * The board itself opens the board, the way the mission pack pages do it.
               * A third of a column cannot hold the measurements the exact geometry
               * carries, so this draws the plain one and a press enlarges it.
               */}
              <button
                type="button"
                className="group mt-2 block w-full flex-1 text-left"
                aria-label={`Enlarge terrain layout ${label}: ${deployment.name} battlefield with ${terrain.name}`}
                onClick={() => setInspecting(terrain.id)}
              >
                <TerrainBoard
                  layout={terrain}
                  deployment={deployment}
                  templates={references?.templates ?? []}
                  className="w-full"
                  ariaLabel={`Layout ${label}: ${deployment.name} battlefield with ${terrain.name}`}
                />
                <span className="mt-2 flex items-center justify-center gap-1 text-xs font-bold text-bone uppercase group-hover:text-azure">
                  <Eye className="size-3.5 shrink-0 text-dim group-hover:text-azure" />
                  {deployment.name}
                </span>
              </button>
            </article>
          )
        })}
      </div>
      {options.some((option) => !option.terrain.geometry) ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Terrain labels and measurements are still loading. Those layouts cannot be selected yet.
        </p>
      ) : null}
      <Dialog open={Boolean(inspected)} onOpenChange={(open) => !open && setInspecting(null)}>
        {inspected ? (
          <TerrainLayoutDialogContent
            title={inspected.deployment.name}
            description={`${inspected.terrain.name} terrain and deployment zones.`}
            layout={inspected.terrain}
            deployment={inspected.deployment}
            templates={references?.templates ?? []}
            ariaLabel={`${inspected.deployment.name} battlefield with ${inspected.terrain.name}`}
          />
        ) : null}
      </Dialog>
    </section>
  )
}
