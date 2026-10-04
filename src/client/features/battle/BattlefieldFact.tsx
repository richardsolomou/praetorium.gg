import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { isKotcLimit } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import { KOTC_MATCHUP_ID, type Deployment } from '../../../contracts/terrain'
import { terrainMatchupIds, terrainReferencesQuery } from '../../queries'
import { sides } from '../../sides'
import { Fact } from '../../components/Fact'
import { TerrainBoard } from '../reference/missions/TerrainBoard'
import { battlefieldLayout } from './battlefieldLayout'

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
  const matchupIds = isKotcLimit(view.settings.limit)
    ? [KOTC_MATCHUP_ID]
    : terrainMatchupIds(sides(view).flatMap((side) => (side.disposition ? [side.disposition] : [])))
  const query = terrainReferencesQuery(matchupIds)
  const references = useQuery({ ...query, enabled: open && Boolean(view.settings.terrainLayoutId) && query.enabled })
  const layout = battlefieldLayout(view.settings.terrainLayoutId, references.data?.layouts)

  if (!deployment) return <Fact label="Battlefield" value="Not chosen" />

  const value = objectives ? `${deployment.name} · ${deployment.objectives.length} objectives` : deployment.name
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
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{deployment.name}</DialogTitle>
              <DialogDescription>{layout?.name ?? 'Battlefield layout'}</DialogDescription>
            </DialogHeader>
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
          </DialogContent>
        </Dialog>
      </dd>
    </div>
  )
}
