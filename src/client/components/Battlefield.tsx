import { useQuery } from '@tanstack/react-query'
import { Check, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BattleView, Command } from '../../core/battle'
import { TerrainBoard } from '../../routes/mission-matchups.$packId.$you.$opponent'
import { deploymentsQuery, terrainMatchupIds, terrainReferencesQuery } from '../queries'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean; allowedIds?: string[] }

export function Battlefield({ view, send, pending, allowedIds }: Props) {
  const { data: allPatterns } = useQuery(deploymentsQuery())
  const dispositions = view.players.map((player) => player.roster?.built?.disposition).filter((value): value is string => Boolean(value))
  const matchupIds = terrainMatchupIds(dispositions, view.settings.solo)
  const { data: references } = useQuery(terrainReferencesQuery(matchupIds))
  const options =
    references?.layouts.flatMap((terrain) => {
      const deployment = allPatterns?.find((pattern) => pattern.id === terrain.deploymentId)
      if (!deployment || (allowedIds?.length && !allowedIds.includes(deployment.id))) return []
      return [{ terrain, deployment }]
    }) ?? []
  const available = options.filter((option) => option.terrain.geometry)

  if (!matchupIds.length) return <p className="text-sm text-dim">Both armies determine the three deployment and terrain layouts.</p>
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
                templates={references?.templates ?? []}
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
