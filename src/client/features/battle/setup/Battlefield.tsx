import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Maximize2, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isKotcLimit } from '../../../../core/battle'
import type { BattleView } from '../../../../core/battleView'
import { deploymentsQuery, terrainReferencesQuery } from '../../../queries'
import { battleMatchupIds } from '../battlefieldLayout'
import { CHOSEN } from './chrome'
import { Dialog } from '../../../components/Dialog'
import { TerrainBoard } from '../../reference/missions/TerrainBoard'
import { TerrainLayoutDialogContent } from '../../reference/missions/TerrainLayoutDialogContent'
import type { SendCommand } from '../useCommand'

type Props = {
  view: BattleView
  send: SendCommand
  pending: boolean
  allowedIds?: string[]
  /** The two dispositions these layouts are for, named the way the pack names them. */
  matchup?: string
}

export function Battlefield({ view, send, pending, allowedIds, matchup }: Props) {
  const [inspecting, setInspecting] = useState<string | null>(null)
  // The battle version whose fixed battlefield was already sent, so a failed attempt offers a retry instead of repeating.
  const [attemptedSeq, setAttemptedSeq] = useState<number | null>(null)
  const patternsQuery = useQuery(deploymentsQuery())
  const allPatterns = patternsQuery.data
  const kotc = isKotcLimit(view.settings.limit)
  const matchupIds = battleMatchupIds(view)
  const referencesQuery = useQuery(terrainReferencesQuery(matchupIds))
  const references = referencesQuery.data
  const options =
    references?.layouts.flatMap((terrain) => {
      const deployment = allPatterns?.find((pattern) => pattern.id === terrain.deploymentId)
      if (!deployment || (!kotc && allowedIds?.length && !allowedIds.includes(deployment.id))) return []
      return [{ terrain, deployment }]
    }) ?? []
  const available = options.filter((option) => option.terrain.geometry)
  const inspected = options.find((option) => option.terrain.id === inspecting)
  const singleColosseum = kotc && options.length === 1
  const fixed = singleColosseum ? available[0] : undefined
  const fixedTerrainId = fixed?.terrain.id
  const fixedPatternId = fixed?.deployment.id
  const fixedSelected = fixed && view.settings.terrainLayoutId === fixed.terrain.id && view.deploymentId === fixed.deployment.id

  useEffect(() => {
    if (!fixedTerrainId || !fixedPatternId || fixedSelected || pending || attemptedSeq === view.seq) return
    const seq = view.seq
    send({ kind: 'set-battlefield', patternId: fixedPatternId, terrainLayoutId: fixedTerrainId }, { complete: () => setAttemptedSeq(seq) })
  }, [attemptedSeq, fixedTerrainId, fixedPatternId, fixedSelected, pending, send, view.seq])

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
  const loading = patternsQuery.isPending || referencesQuery.isPending
  const failed = patternsQuery.isError || referencesQuery.isError

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Named like the panel above it, so the two questions the step asks look alike. */}
        <div className="min-w-0">
          <p className="eyebrow">{matchup && !singleColosseum ? `Layouts for ${matchup}` : 'Deployment and terrain layout'}</p>
          {singleColosseum ? (
            <p className="mt-0.5 max-w-2xl text-sm text-dim">
              The Colosseum battlefield is fixed. Use the enlarged map to place its terrain and objectives.
            </p>
          ) : null}
        </div>
        {!singleColosseum ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !available.length}
            onClick={() => {
              const option = randomItem(available)
              if (option) send({ kind: 'set-battlefield', patternId: option.deployment.id, terrainLayoutId: option.terrain.id })
            }}
          >
            <Shuffle /> Select random
          </Button>
        ) : null}
      </div>
      {/* An unanswered request is not an empty pack, so the three cards are reserved until one of them is. */}
      {loading ? (
        <LayoutsLoading />
      ) : failed ? (
        <p className="mt-3 text-sm text-dim">Battlefield layouts are unavailable right now. Try again shortly.</p>
      ) : !options.length ? (
        <p className="mt-3 text-sm text-dim">No combined battlefield layouts match these armies and mission.</p>
      ) : (
        // A phone swipes between the layouts rather than scrolling past three full boards.
        <div
          className={
            singleColosseum
              ? 'mt-3 flex justify-center'
              : '-mx-3 mt-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0'
          }
        >
          {options.map(({ terrain, deployment }, index) => {
            const selected = view.settings.terrainLayoutId === terrain.id && view.deploymentId === deployment.id
            const label = String.fromCharCode(65 + index)
            return (
              <article
                key={terrain.id}
                className={`flex h-full flex-col border bg-panel p-3 transition-colors max-sm:w-4/5 max-sm:shrink-0 max-sm:snap-start ${singleColosseum ? 'w-full max-w-md border-edge' : selected ? CHOSEN : 'border-edge hover:border-info'}`}
              >
                {/*
                 * The board opens the board, the way the mission pack pages do it. A third of a
                 * column cannot hold the measurements the exact geometry carries, so this draws
                 * the plain one and a press enlarges it.
                 */}
                <button
                  type="button"
                  className="group block w-full flex-1 text-left focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
                  aria-label={
                    singleColosseum
                      ? 'Enlarge Colosseum battlefield'
                      : `Enlarge terrain layout ${label}: ${deployment.name} battlefield with ${terrain.name}`
                  }
                  onClick={() => setInspecting(terrain.id)}
                >
                  <span className="flex items-center gap-2">
                    {singleColosseum ? null : <span className="text-lg font-bold">{label}</span>}
                    <span className="min-w-0 flex-1 truncate text-sm text-dim transition-colors group-hover:text-bone">
                      {singleColosseum ? 'View setup measurements' : deployment.name}
                    </span>
                    <Maximize2 className="size-4 shrink-0 text-dim transition-colors group-hover:text-info" aria-hidden />
                  </span>
                  <TerrainBoard
                    layout={terrain}
                    deployment={deployment}
                    templates={references?.templates ?? []}
                    className="mt-2 w-full"
                    ariaLabel={`Layout ${label}: ${deployment.name} battlefield with ${terrain.name}`}
                  />
                </button>
                {!singleColosseum ? (
                  <Button
                    variant={selected ? 'secondary' : 'outline'}
                    className="mt-3 w-full"
                    disabled={!terrain.geometry || pending}
                    aria-label={`${selected ? 'Selected' : 'Select'} layout ${label}: ${deployment.name}`}
                    onClick={() => {
                      if (!pending) send({ kind: 'set-battlefield', patternId: deployment.id, terrainLayoutId: terrain.id })
                    }}
                  >
                    {selected ? <Check /> : null}
                    {selected ? 'Selected' : terrain.geometry ? 'Select' : 'Loading'}
                  </Button>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
      {fixed && !fixedSelected && !pending && attemptedSeq === view.seq ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => send({ kind: 'set-battlefield', patternId: fixed.deployment.id, terrainLayoutId: fixed.terrain.id })}
        >
          Retry battlefield setup
        </Button>
      ) : null}
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

const randomItem = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]

/** The three layout cards at their final geometry, while the pack is still being read. */
function LayoutsLoading() {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3" aria-label="Loading battlefield layouts">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col border border-edge bg-panel p-3" aria-hidden>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="mt-2 aspect-[44/60] w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
        </div>
      ))}
    </div>
  )
}
