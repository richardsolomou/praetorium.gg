import { useQuery } from '@tanstack/react-query'
import { Check, Maximize2, Shuffle } from 'lucide-react'
import { useEffect, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isKotcLimit } from '../../../../core/battle'
import { groupBy } from '../../../../core/collections'
import type { BattleView } from '../../../../core/battleView'
import { deploymentsQuery, terrainReferencesQuery } from '../../../queries'
import { battleMatchupIds } from '../battlefieldLayout'
import { CHOSEN } from './chrome'
import { Dialog } from '../../../components/Dialog'
import { Problem } from '../../../components/Problem'
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
  const fixedByOrganizer = view.battlefieldFixed
  const options =
    references?.layouts.flatMap((terrain) => {
      const deployment = allPatterns?.find((pattern) => pattern.id === terrain.deploymentId)
      if (fixedByOrganizer && terrain.id !== view.settings.terrainLayoutId) return []
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
    if (view.players.some((player) => player.dispositionChoices.length > 1 && !player.disposition))
      return <p className="text-sm text-dim">Choose each side’s Force Disposition in the Mission step to see its layouts.</p>
    return <p className="text-sm text-dim">Both armies determine the three deployment and terrain layouts.</p>
  }
  const loading = patternsQuery.isPending || referencesQuery.isPending
  const failed = patternsQuery.isError || referencesQuery.isError

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Named like the panel above it, so the two questions the step asks look alike. */}
        <div className="min-w-0">
          <p className="eyebrow">
            {kotc ? 'King of the Colosseum battlefields' : matchup ? `Layouts for ${matchup}` : 'Deployment and terrain layout'}
          </p>
          {singleColosseum ? (
            <p className="mt-0.5 max-w-2xl text-sm text-dim">
              The Colosseum battlefield is fixed. Use the enlarged map to place its terrain and objectives.
            </p>
          ) : null}
        </div>
        {fixedByOrganizer ? <p className="text-sm text-dim">The organizer set this battlefield.</p> : null}
        {!singleColosseum && !fixedByOrganizer ? (
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
        // A phone swipes between the layouts rather than scrolling past three full boards. Each matchup gets its own row,
        // so the square Colosseums don't stretch to the height of the portrait Combat Patrol boards.
        [...groupBy(options, (option) => option.terrain.matchupId).values()].map((row) => (
          <div
            key={row[0]!.terrain.matchupId}
            className={
              singleColosseum
                ? 'mt-3 flex justify-center'
                : '-mx-3 mt-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0'
            }
          >
            {row.map(({ terrain, deployment }, index) => {
              const selected = view.settings.terrainLayoutId === terrain.id && view.deploymentId === deployment.id
              // The Colosseum and Combat Patrol name their own battlefields, Combat Patrol's lettered already.
              const label = kotc ? null : String.fromCharCode(65 + index)
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
                    className="group flex w-full flex-1 flex-col text-left focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none"
                    aria-label={
                      singleColosseum
                        ? 'Enlarge Colosseum battlefield'
                        : label
                          ? `Enlarge terrain layout ${label}: ${deployment.name} battlefield with ${terrain.name}`
                          : `Enlarge ${deployment.name} battlefield`
                    }
                    onClick={() => setInspecting(terrain.id)}
                  >
                    <span className="flex items-center gap-2">
                      {label ? <span className="text-lg font-bold">{label} </span> : null}
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
                      ariaLabel={
                        label ? `Layout ${label}: ${deployment.name} battlefield with ${terrain.name}` : `${deployment.name} battlefield`
                      }
                    />
                  </button>
                  {!singleColosseum && !fixedByOrganizer ? (
                    <Button
                      variant={selected ? 'secondary' : 'outline'}
                      className="mt-3 w-full"
                      disabled={!terrain.geometry || pending}
                      aria-label={`${selected ? 'Selected' : 'Select'} ${label ? `layout ${label}: ` : ''}${deployment.name}`}
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
        ))
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
        <Problem className="mt-2 text-xs">Terrain labels and measurements are still loading. Those layouts cannot be selected yet.</Problem>
      ) : null}
      <BattlefieldDialog option={inspected} templates={references?.templates ?? []} onClose={() => setInspecting(null)} />
    </section>
  )
}

type DialogProps = ComponentProps<typeof TerrainLayoutDialogContent>
type LayoutOption = { terrain: DialogProps['layout']; deployment: NonNullable<DialogProps['deployment']> }

function BattlefieldDialog({
  option,
  templates,
  onClose,
}: {
  option: LayoutOption | undefined
  templates: DialogProps['templates']
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(option)} onOpenChange={(open) => !open && onClose()}>
      {option ? (
        <TerrainLayoutDialogContent
          title={option.deployment.name}
          description={`${option.terrain.name} terrain and deployment zones.`}
          layout={option.terrain}
          deployment={option.deployment}
          templates={templates}
          ariaLabel={`${option.deployment.name} battlefield with ${option.terrain.name}`}
        />
      ) : null}
    </Dialog>
  )
}

/** The chosen battlefield's name, which enlarges it with its measurements while the step is collapsed. */
export function ChosenBattlefield({ view }: { view: BattleView }) {
  const [open, setOpen] = useState(false)
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: references } = useQuery(terrainReferencesQuery(battleMatchupIds(view)))
  const deployment = deployments?.find((pattern) => pattern.id === view.deploymentId)
  const terrain = references?.layouts.find((layout) => layout.id === view.settings.terrainLayoutId)
  if (!deployment) return <span className="text-dim">No layout yet</span>
  if (!terrain?.geometry) return <span className="font-bold uppercase">{deployment.name}</span>
  return (
    <>
      <button
        type="button"
        aria-label={`Enlarge ${deployment.name} battlefield`}
        className="inline-flex cursor-pointer items-center gap-1.5 font-bold uppercase underline decoration-dotted underline-offset-4 hover:text-bone"
        onClick={() => setOpen(true)}
      >
        {deployment.name}
        <Maximize2 className="size-3.5 shrink-0 text-dim" aria-hidden />
      </button>
      <BattlefieldDialog
        option={open ? { terrain, deployment } : undefined}
        templates={references?.templates ?? []}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const randomItem = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]

/** The three layout cards at their final geometry, while the pack is still being read. */
function LayoutsLoading() {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <output className="sr-only">Loading battlefield layouts</output>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col part p-3" aria-hidden>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="mt-2 aspect-[44/60] w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
        </div>
      ))}
    </div>
  )
}
