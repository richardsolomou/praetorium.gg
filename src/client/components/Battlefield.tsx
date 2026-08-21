import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Eye, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Command } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { deploymentsQuery, terrainMatchupIds, terrainReferencesQuery } from '../queries'
import { TerrainBoard } from './TerrainBoard'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean; allowedIds?: string[] }

export function Battlefield({ view, send, pending, allowedIds }: Props) {
  const [inspecting, setInspecting] = useState<string | null>(null)
  const { data: allPatterns } = useQuery(deploymentsQuery())
  const dispositions = [...new Set(view.players.map((player) => player.side))]
    .map((side) => view.players.find((player) => player.side === side)?.roster?.built?.disposition)
    .filter((value): value is string => Boolean(value))
  const matchupIds = terrainMatchupIds(dispositions, view.settings.solo)
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
            <article
              key={terrain.id}
              className={`border bg-sunken p-2 transition-colors ${selected ? 'border-parchment ring-1 ring-parchment' : 'border-edge'}`}
            >
              <span className="block text-center text-lg font-bold">{label}</span>
              <TerrainBoard
                layout={terrain}
                deployment={deployment}
                templates={references?.templates ?? []}
                className="mt-2 w-full"
                detailed
                ariaLabel={`Layout ${label}: ${deployment.name} battlefield with ${terrain.name}`}
              />
              <span className="mt-2 block text-xs font-bold uppercase text-bone">{deployment.name}</span>
              <div className="mt-2 grid grid-cols-2 gap-1 border-t border-edge pt-2">
                <Button variant="ghost" size="sm" onClick={() => setInspecting(terrain.id)}>
                  <Eye /> View
                </Button>
                <Button
                  variant={selected ? 'secondary' : 'ghost'}
                  size="sm"
                  disabled={!terrain.geometry}
                  aria-label={`${selected ? 'Selected' : 'Select'} layout ${label}: ${deployment.name}`}
                  onClick={() => {
                    if (!pending) send({ kind: 'set-battlefield', patternId: deployment.id, terrainLayoutId: terrain.id })
                  }}
                >
                  {selected ? <Check /> : null}
                  {selected ? 'Selected' : terrain.geometry ? 'Select' : 'Syncing'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>
      {options.some((option) => !option.terrain.geometry) ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Exact terrain labels and measurements are still syncing. Those layouts cannot be selected yet.
        </p>
      ) : null}
      <Dialog open={Boolean(inspected)} onOpenChange={(open) => !open && setInspecting(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-4xl">
          {inspected ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl uppercase">{inspected.deployment.name}</DialogTitle>
                <DialogDescription className="text-dim">{inspected.terrain.name} terrain and deployment zones.</DialogDescription>
              </DialogHeader>
              <TerrainBoard
                layout={inspected.terrain}
                deployment={inspected.deployment}
                templates={references?.templates ?? []}
                className="mx-auto max-h-[70dvh] w-full max-w-xl"
                detailed
                ariaLabel={`${inspected.deployment.name} battlefield with ${inspected.terrain.name}`}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
