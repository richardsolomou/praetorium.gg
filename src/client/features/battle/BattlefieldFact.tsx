import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { BattleView } from '../../../core/battleView'
import type { Deployment } from '../../../contracts/terrain'
import { terrainReferencesQuery } from '../../queries'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { Fact } from '../../components/Fact'
import { deploymentObjectiveMarkers, objectiveTerrainMarkers } from '../reference/missions/terrainGeometry'
import { TerrainBoard } from '../reference/missions/TerrainBoard'
import { battleMatchupIds, battlefieldLayout } from './battlefieldLayout'
import { countLabel } from '../../text'

export function BattlefieldFact({
  view,
  deployment,
  objectives = false,
}: {
  view: BattleView
  deployment: Deployment | null
  objectives?: boolean
}) {
  const [open, setOpen] = useState(false)
  const query = terrainReferencesQuery(battleMatchupIds(view))
  const references = useQuery({ ...query, enabled: (open || objectives) && Boolean(view.settings.terrainLayoutId) && query.enabled })
  const layout = battlefieldLayout(view.settings.terrainLayoutId, references.data?.layouts)

  if (!deployment) return <Fact label="Battlefield" value="Not chosen" />

  const count = layout
    ? deploymentObjectiveMarkers(layout.geometry, deployment.objectives).length +
      (layout.geometry ? objectiveTerrainMarkers(layout.geometry).length : 0)
    : view.settings.terrainLayoutId
      ? null
      : deployment.objectives.length
  const value = objectives && count !== null ? `${deployment.name} · ${countLabel(count, 'objective')}` : deployment.name
  return (
    <div className="min-w-0">
      <dt className="eyebrow">Battlefield</dt>
      <dd>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <button
                type="button"
                aria-label={`View ${deployment.name} battlefield`}
                className="block max-w-full truncate text-left text-info underline underline-offset-2 hover:text-bone"
              />
            }
            title={value}
          >
            {value}
          </DialogTrigger>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>{deployment.name}</DialogTitle>
              <DialogDescription>{layout?.name ?? 'Battlefield layout'}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {view.settings.terrainLayoutId && !layout ? (
                <output className="text-dim">
                  {references.isFetching ? 'Loading battlefield…' : 'The saved battlefield layout is unavailable.'}
                </output>
              ) : (
                <TerrainBoard
                  layout={layout ?? { name: deployment.name, pieces: [], geometry: null }}
                  deployment={deployment}
                  templates={references.data?.templates ?? []}
                  ariaLabel={`${deployment.name} battlefield map`}
                  className="mx-auto max-h-[calc(100dvh-10rem)] w-full"
                />
              )}
            </DialogBody>
          </DialogContent>
        </Dialog>
      </dd>
    </div>
  )
}
