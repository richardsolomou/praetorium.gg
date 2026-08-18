import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { EllipsisVertical, RotateCcw, Undo2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { STRATAGEM_CP_MAX } from '../../core/battle'
import { deleteBattle } from '../../server/functions'
import {
  battleQuery,
  battlesQuery,
  deploymentsQuery,
  detachmentRulesQuery,
  gameReferencesQuery,
  terrainMatchupIds,
  terrainReferencesQuery,
} from '../queries'
import { errorMessage } from '../queryClient'
import type { BattleView, Command, Phase } from '../../core/battle'
import type { PresentPlayer } from '../useLiveBattle'
import { Disclosure } from './Disclosure'
import { Report, type ReportPlayer } from './Report'

type Props = {
  view: BattleView
  /** Derived from both armies' dispositions, so it is the same on both devices. */
  mission: { id: string; name: string; roundCap: number | null; gameCap: number | null } | null
  present: PresentPlayer[]
  send: (command: Command) => void
  pending: boolean
  problem: string | null
}

/** Side 0 is the player who opened the battle. The tint is how you tell whose number you are reading. */
const SIDES = [
  { accent: 'border-l-side-a', value: 'text-side-a' },
  { accent: 'border-l-side-b', value: 'text-side-b' },
]
const MOBILE_TABS = ['info', 'events'] as const

/** The tracker draws every mission and stratagem the same way: a named card you can act on. */
const HEADING = 'text-xs font-bold tracking-[0.08em] text-bone uppercase'
const CARD = 'rounded-sm border border-edge bg-sunken px-2.5 py-1.5'
const CARD_NAME = 'text-sm leading-tight font-bold text-azure uppercase'
const CP_PILL = 'readout shrink-0 rounded-sm bg-azure/15 px-1.5 py-px text-[0.6875rem] font-bold text-azure uppercase'

export function Tracker({ view, mission, present, send, pending, problem }: Props) {
  const [mobileTab, setMobileTab] = useState<'info' | 'events'>('info')
  const [allPhases, setAllPhases] = useState(false)
  const you = view.players.find((player) => player.isViewer)
  const built = you?.roster?.built
  // The cards say what they pay out, so the interface can offer the figure instead
  // of asking a player to work it out.
  const detachmentNames = built?.detachments?.map((detachment) => detachment.name) ?? (built?.detachment ? [built.detachment] : [])
  const { data: rules } = useQuery(detachmentRulesQuery(built?.catalogueId ?? '', detachmentNames))
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const dispositions = [...new Set(view.players.map((player) => player.side))]
    .map((side) => view.players.find((player) => player.side === side)?.roster?.built?.disposition)
    .filter((value): value is string => Boolean(value))
  const { data: terrainReferences } = useQuery(terrainReferencesQuery(terrainMatchupIds(dispositions, view.settings.solo)))
  const deployment = deployments?.find((entry) => entry.id === view.deploymentId)
  const missionPack = references?.packs.find((entry) => entry.id === view.settings.missionPackId)
  const terrain = terrainReferences?.layouts.find((entry) => entry.id === view.settings.terrainLayoutId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteBattle({ data: { token: view.token } }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: battleQuery(view.token).queryKey })
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles' })
    },
  })
  const awardsFor = (key: string, mode?: string) =>
    ([...(rules?.secondaries ?? []), ...(rules?.primaries ?? [])].find((card) => card.key === key)?.awards ?? []).filter(
      (award) => !award.mode || !mode || award.mode === mode,
    )

  /** Why this payout is not available right now, or null when it is. */
  const blocked = (award: Award): string | null => {
    const trigger = award.trigger
    if (trigger.playerTurn === 'your-turn' && !you?.isActive) return 'on your own turn'
    if (trigger.phase && trigger.phase !== view.phase) return `in the ${trigger.phase} phase`
    if (trigger.roundMin !== null && view.round < trigger.roundMin) return `from round ${trigger.roundMin}`
    if (trigger.roundMax !== null && view.round > trigger.roundMax) return `up to round ${trigger.roundMax}`
    return null
  }
  // Core stratagems are the same for every army, so membership of that list is what
  // separates them from the ones a detachment brought — on either player's panel.
  const coreKeys = new Set((rules?.core ?? []).map((stratagem) => stratagem.key))
  // Seats are ordered by side, so both devices agree on which player is which colour.
  const reportPlayers: ReportPlayer[] = view.players.map((player) => ({
    id: player.id,
    name: player.name,
    className: SIDES[player.side]?.value ?? '',
  }))
  const yourTurn = Boolean(you?.isActive)
  const active = view.players.find((player) => player.isActive)
  const finished = view.status === 'finished'

  return (
    /* Edge to edge: all three columns are in use for the whole game. */
    <main className="w-full space-y-3 px-3 pt-3 pb-36 lg:pb-6">
      {/* The centre column already announces the round and phase, so this only carries the settings. */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-edge pb-2">
        <p className="text-xs text-dim">
          {[
            finished ? 'Battle over' : null,
            view.settings.limit ? `${view.settings.limit} points` : null,
            missionPack?.name,
            terrain?.name,
            view.attackerId ? `${view.players.find((player) => player.id === view.attackerId)?.name ?? 'Unknown'} attacking` : null,
            resultLabel(view),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {finished ? null : (
          <p className="text-sm text-dim">
            {yourTurn ? <span className="text-azure">Your turn</span> : `${active?.name ?? 'Nobody'}’s turn`}
          </p>
        )}
      </header>

      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)_minmax(0,1fr)]">
        {view.players.map((player, index) => (
          <section
            key={player.id}
            data-panel="player"
            className={`${mobileTab === 'events' ? 'hidden lg:block' : ''} space-y-3 rounded-lg border border-edge border-l-2 bg-panel p-4 ${index < 2 ? 'lg:row-start-1' : 'lg:row-start-2'} ${player.side === 0 ? 'lg:col-start-1' : 'lg:col-start-3'} ${SIDES[player.side]?.accent ?? ''} ${
              player.isActive ? 'ring-2 ring-azure/50' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`truncate text-xl leading-tight font-bold uppercase ${SIDES[player.side]?.value ?? ''}`}>
                  {player.name}
                  {player.isViewer ? <span className="ml-1.5 text-xs font-normal normal-case text-dim">you</span> : null}
                </p>
                {/* The list names itself after its detachment, so appending it would say it twice. */}
                <p className="truncate text-xs font-semibold tracking-[0.04em] text-azure uppercase">{rosterLine(player.roster)}</p>
              </div>
              <span
                className={`size-2 shrink-0 rounded-full ${
                  present.some((watcher) => watcher.playerId === player.id) ? 'bg-azure' : 'border border-dim/60'
                }`}
                title={present.some((watcher) => watcher.playerId === player.id) ? 'Watching now' : 'Not on the page'}
              />
            </div>

            <div className="flex items-baseline justify-between gap-2 rounded-sm border border-edge bg-sunken px-2.5 py-1.5">
              <span className="min-w-0 truncate text-xs font-semibold uppercase">{player.roster?.name ?? 'List not attached'}</span>
              <span className="readout shrink-0 text-[0.6875rem] text-dim">{rosterPoints(player.roster)}</span>
            </div>

            {/* The turn belongs to a player, so the control that ends it sits in their panel —
                visible to both, but only the player taking the turn can press it. */}
            {/* Ending the turn belongs to whoever is taking it; taking an action back belongs to
                whoever did it. Both sit by the player they concern rather than in the middle. */}
            {!finished && (player.isActive || player.isViewer) ? (
              <div className="space-y-2 rounded-sm border border-edge bg-sunken p-2">
                {player.isActive ? <p className="eyebrow text-center">Now · {view.phase} phase</p> : null}
                <div className="flex items-stretch gap-2">
                  {player.isViewer ? (
                    <Button
                      variant="outline"
                      className={`h-11 px-3 ${player.isActive ? 'shrink-0' : 'w-full'}`}
                      aria-label="Undo"
                      title="Undo latest action"
                      disabled={view.undoable === null || pending}
                      onClick={() => view.undoable !== null && send({ kind: 'undo', target: view.undoable })}
                    >
                      <Undo2 />
                      {player.isActive ? null : <span className="ml-2">Undo</span>}
                    </Button>
                  ) : null}
                  {player.isActive ? (
                    <div className="min-w-0 flex-1">
                      <AdvanceControl view={view} pending={pending} yourTurn={yourTurn} send={send} />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid gap-x-4 gap-y-3 xl:grid-cols-2 xl:items-start">
              <div className="space-y-3">
                <div className="border-t border-edge pt-3">
                  <p className={HEADING}>Victory points</p>
                  <p data-stat="vp" className="readout mt-0.5 text-4xl leading-none font-bold">
                    {player.total}
                  </p>
                </div>

                <div>
                  <p className={HEADING}>Battle ready</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                    <span className={player.painted ? 'text-achieved' : 'text-dim'}>
                      {player.painted ? `Painted. +${player.paintedPoints} VP at the end of the battle.` : 'No bonus.'}
                    </span>
                    {player.isViewer ? (
                      <Button
                        variant={player.painted ? 'default' : 'outline'}
                        size="xs"
                        disabled={pending}
                        onClick={() => send({ kind: 'set-painted', painted: !player.painted })}
                      >
                        {player.painted ? 'Remove' : 'Add'} bonus
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-5 border-y border-edge py-2">
                  {player.rounds.map((round) => (
                    <div key={round.round} className={`text-center ${round.round > 1 ? 'border-l border-edge' : ''}`}>
                      <p className="eyebrow">T{round.round}</p>
                      <p className={`readout text-lg ${round.round === view.round ? SIDES[index]?.value : 'text-dim'}`}>{round.total}</p>
                      <p className="readout text-[0.625rem] text-faint">
                        {round.primary}+{round.secondary}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 border-t border-edge pt-3">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className={HEADING}>Primary mission</span>
                    <span className="readout text-xs text-dim">
                      <span data-stat="primary">{player.primary}</span>/{mission?.gameCap ?? view.guides.primary}
                    </span>
                  </p>
                  {player.primaryCard ? (
                    <div className={`${CARD} space-y-1.5`}>
                      <p className={CARD_NAME}>{player.primaryCard.name}</p>
                      {player.isViewer && !finished ? (
                        <div className="flex flex-wrap gap-1">
                          {pick(awardsFor(player.primaryCard.key)).map((award) => (
                            <Button
                              key={`${award.vp}-${award.per ?? ''}-${award.mode ?? ''}`}
                              variant="outline"
                              size="icon-sm"
                              className="w-auto px-1.5"
                              disabled={pending || blocked(award) !== null}
                              title={blocked(award) ? `Only ${blocked(award)}` : awardTitle(award)}
                              aria-label={`Primary plus ${award.vp}${award.per ? ` per ${award.per.replaceAll('-', ' ')}` : ''}`}
                              onClick={() => send({ kind: 'score', category: 'primary', delta: award.vp })}
                            >
                              +{award.vp}
                              {award.per ? <span className="ml-0.5 text-[0.625rem] opacity-70">ea</span> : null}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1.5 border-t border-edge pt-3">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className={HEADING}>Secondary missions</span>
                    <span className="readout text-xs text-dim">
                      <span data-stat="secondary">{player.secondary}</span>/{view.guides.secondary}
                    </span>
                  </p>
                  {player.secondaries.map((secondary) => (
                    <div key={secondary.key} data-secondary={secondary.key} className={`${CARD} space-y-1 text-sm`}>
                      <span className="flex items-baseline gap-2">
                        <span className={`min-w-0 flex-1 ${CARD_NAME}`}>
                          {secondary.name}
                          {secondary.secret ? (
                            <span className="ml-1.5 text-[0.625rem] font-semibold text-azure uppercase">
                              {secondary.revealed ? 'revealed' : 'secret'}
                            </span>
                          ) : null}
                          {secondary.status === 'active' ? null : (
                            <span
                              className={`ml-1.5 text-[0.625rem] font-semibold uppercase ${secondary.status === 'achieved' ? 'text-achieved' : 'text-discarded'}`}
                            >
                              {secondary.status}
                            </span>
                          )}
                        </span>
                        <span className="readout shrink-0 font-bold">{secondary.points}</span>
                      </span>
                      <span className="readout block text-[0.625rem] text-faint">
                        {secondary.rounds.map((points, round) => `T${round + 1} ${points}`).join(' · ')}
                      </span>
                      {player.isViewer && !finished && secondary.status === 'active' ? (
                        <span className="flex flex-wrap gap-1">
                          {pick(awardsFor(secondary.key, player.secondaryMode)).map((award) => (
                            <Button
                              key={`${award.vp}-${award.per ?? ''}-${award.mode ?? ''}`}
                              variant="outline"
                              size="icon-sm"
                              className="w-auto px-1.5"
                              disabled={pending || blocked(award) !== null}
                              title={blocked(award) ? `Only ${blocked(award)}` : awardTitle(award)}
                              aria-label={`${secondary.name} plus ${award.vp}${award.per ? ` per ${award.per.replaceAll('-', ' ')}` : ''}`}
                              onClick={() => send({ kind: 'score-secondary', key: secondary.key, delta: award.vp })}
                            >
                              +{award.vp}
                              {award.per ? <span className="ml-0.5 text-[0.625rem] opacity-70">ea</span> : null}
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="w-auto px-1 text-[0.625rem] text-achieved"
                            onClick={() => send({ kind: 'set-secondary-status', key: secondary.key, status: 'achieved' })}
                          >
                            Achieve
                          </Button>
                          {player.secondaryMode === 'tactical' ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="w-auto px-1 text-[0.625rem] text-discarded"
                              onClick={() => send({ kind: 'set-secondary-status', key: secondary.key, status: 'discarded' })}
                            >
                              Discard
                            </Button>
                          ) : null}
                          {secondary.secret && !secondary.revealed ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="w-auto px-1 text-[0.625rem] text-azure"
                              onClick={() => send({ kind: 'reveal-secret' })}
                            >
                              Reveal
                            </Button>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {player.isViewer &&
                  !finished &&
                  player.secondaryMode === 'tactical' &&
                  player.secondaries.filter((card) => card.status === 'active').length < 2 ? (
                    <div className="space-y-2 rounded-sm border border-azure/40 bg-azure/5 px-2.5 py-2">
                      <p className={HEADING}>{player.secondaries.length ? 'Draw a replacement' : 'Draw a mission'}</p>
                      <div className="space-y-2">
                        <p className="text-xs text-dim">{player.remainingSecondaries.length} cards remaining</p>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={pending || !player.remainingSecondaries.length}
                          onClick={() => {
                            const card = randomEntry(player.remainingSecondaries)
                            if (card) send({ kind: 'draw-secondary', secondary: card })
                          }}
                        >
                          Draw at random
                        </Button>
                        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                          {player.remainingSecondaries.map((card) => (
                            <Button
                              key={card.key}
                              variant="outline"
                              size="sm"
                              className="h-7 text-[0.625rem]"
                              onClick={() => send({ kind: 'draw-secondary', secondary: { key: card.key, name: card.name } })}
                            >
                              {card.name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {player.isViewer && !finished && !player.secondaries.some((card) => card.secret) ? (
                    <Disclosure label="Select secret mission" className="pt-1" triggerClassName="eyebrow text-azure">
                      <div className="mt-1 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                        {player.remainingSecondaries.map((card) => (
                          <Button
                            key={card.key}
                            variant="outline"
                            size="sm"
                            className="h-7 text-[0.625rem]"
                            onClick={() => send({ kind: 'select-secret', secondary: { key: card.key, name: card.name } })}
                          >
                            {card.name}
                          </Button>
                        ))}
                      </div>
                    </Disclosure>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="border-t border-edge pt-3">
                  <p className={HEADING}>Command points</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span data-stat="cp" className={`readout text-3xl leading-none ${SIDES[index]?.value ?? ''}`}>
                      {player.cp}
                    </span>
                    {/* Gaining a point is a thing the rules do; losing one by hand is a mistake, and undo covers that. */}
                    {player.isViewer && !finished ? (
                      <Button variant="secondary" size="xs" disabled={pending} onClick={() => send({ kind: 'adjust-cp', delta: 1 })}>
                        +1 additional CP
                      </Button>
                    ) : null}
                  </div>
                  <p className="readout mt-1 text-[0.6875rem] text-faint">
                    {player.cpGained} gained · {player.cpSpent} used
                  </p>
                </div>

                {player.stratagems.length ? (
                  <div className="space-y-3 border-t border-edge pt-3">
                    {stratagemGroups(player.stratagems, coreKeys).map((group) => {
                      const shown = allPhases ? group.items : group.items.filter((stratagem) => playableIn(stratagem, view.phase))
                      if (!shown.length) return null
                      return (
                        <div key={group.label} className="space-y-1.5">
                          <p className={HEADING}>{group.label}</p>
                          {shown.map((stratagem) => (
                            <StratagemCard
                              key={stratagem.key}
                              stratagem={stratagem}
                              actionable={player.isViewer && !finished}
                              pending={pending}
                              available={player.cp}
                              onUse={(cp) => send({ kind: 'use-stratagem', key: stratagem.key, ...(cp === undefined ? {} : { cp }) })}
                            />
                          ))}
                        </div>
                      )
                    })}
                    {hiddenThisPhase(player.stratagems, view.phase) && !allPhases ? (
                      <Button variant="ghost" size="xs" className="text-azure" onClick={() => setAllPhases(true)}>
                        Show {hiddenThisPhase(player.stratagems, view.phase)} for other phases
                      </Button>
                    ) : null}
                    {allPhases ? (
                      <Button variant="ghost" size="xs" className="text-azure" onClick={() => setAllPhases(false)}>
                        Only this phase
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ))}

        <section className="order-first space-y-3 border border-edge bg-panel p-4 sm:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <ToggleGroup
            value={[mobileTab]}
            onValueChange={(value) => {
              const next = MOBILE_TABS.find((tab) => tab === value[0])
              if (next) setMobileTab(next)
            }}
            spacing={0}
            variant="default"
            className="grid h-auto w-full grid-cols-2 gap-0 border-b border-edge lg:hidden"
            aria-label="Battle details"
          >
            {MOBILE_TABS.map((tab) => (
              <ToggleGroupItem
                key={tab}
                value={tab}
                className="eyebrow rounded-none border-b-2 border-transparent py-2 aria-pressed:border-b-azure aria-pressed:text-azure"
              >
                {tab}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className={mobileTab === 'events' ? 'hidden lg:block' : ''}>
            <div className="text-center">
              {finished ? (
                <>
                  <p className="eyebrow">Final result</p>
                  <h1 className="mt-1 text-xl font-bold uppercase">{outcome(view)}</h1>
                </>
              ) : (
                <>
                  <p className="eyebrow">Battle round</p>
                  <p className="readout mt-1 text-4xl leading-none font-bold">
                    <span data-stat="round">{view.round}</span>
                    <span className="ml-1.5 text-base font-normal text-dim">of {view.rounds}</span>
                  </p>
                  <h1 className="mt-2 text-xl font-bold uppercase">{view.phase} phase</h1>
                </>
              )}
              <p className="mt-1 text-xs text-dim">{mission?.name ?? 'Matched play'}</p>
              {deployment ? (
                <p className="mt-1 text-xs text-dim" title={deployment.description ?? undefined}>
                  {deployment.name} · {deployment.objectives.length} objectives
                </p>
              ) : null}
            </div>
          </div>
          <ReportDetails token={view.token} players={reportPlayers} hiddenOnMobile={mobileTab !== 'events'} />
          {finished ? (
            <div className={`${mobileTab === 'events' ? 'hidden lg:block' : ''} space-y-2 border-t border-edge pt-3`}>
              <Button variant="secondary" className="w-full" disabled={pending} onClick={() => send({ kind: 'reopen-battle' })}>
                <RotateCcw /> Reopen battle
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={view.undoable === null || pending}
                onClick={() => view.undoable !== null && send({ kind: 'undo', target: view.undoable })}
              >
                <Undo2 /> Undo latest action
              </Button>
            </div>
          ) : (
            <div className={`${mobileTab === 'events' ? 'hidden lg:block' : ''} space-y-2 border-t border-edge pt-3`}>
              <EndBattleDialog
                pending={pending}
                label="Finish early"
                onConfirm={() => send({ kind: 'end-battle', reason: 'finished-early' })}
              />
              <EndBattleDialog
                pending={pending}
                label="Concede battle"
                description="This records that you conceded and ends the battle for every player."
                onConfirm={() => send({ kind: 'end-battle', reason: 'conceded', concededBy: view.viewerId })}
              />
            </div>
          )}
          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
          {remove.error ? <p className="text-sm text-destructive">{errorMessage(remove.error)}</p> : null}
          {view.creatorId === view.viewerId ? <DeleteBattleDialog pending={remove.isPending} onConfirm={() => remove.mutate()} /> : null}
        </section>
      </div>

      <MobileScoreboard view={view} />
    </main>
  )
}

function AdvanceControl({
  view,
  pending,
  yourTurn,
  send,
}: {
  view: BattleView
  pending: boolean
  yourTurn: boolean
  send: (command: Command) => void
}) {
  const label = view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`
  const trigger = (
    <Button
      variant={yourTurn ? 'default' : 'outline'}
      className="h-11 w-full text-base"
      disabled={!yourTurn || pending}
      title={yourTurn ? undefined : 'Only the player taking the turn can end a phase'}
    >
      {label}
    </Button>
  )
  if (!view.advancePrompt) return <Button {...trigger.props} onClick={() => send({ kind: 'advance' })} />
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="uppercase">Score before continuing?</AlertDialogTitle>
          <AlertDialogDescription className="text-dim">{view.advancePrompt}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-none border-edge bg-sunken">
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={() => send({ kind: 'advance' })}>Continue anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function EndBattleDialog({
  pending,
  label,
  description = 'This records the current score as final. You can reopen the battle afterward.',
  onConfirm,
}: {
  pending: boolean
  label: string
  description?: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" className="w-full" disabled={pending} />}>{label}</AlertDialogTrigger>
      <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="uppercase">{label}?</AlertDialogTitle>
          <AlertDialogDescription className="text-dim">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-none border-edge bg-sunken">
          <AlertDialogCancel>Keep playing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteBattleDialog({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" className="w-full text-destructive" disabled={pending} />}>
        Delete battle
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="uppercase">Delete this battle?</AlertDialogTitle>
          <AlertDialogDescription className="text-dim">
            The battle and its full command history will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-none border-edge bg-sunken">
          <AlertDialogCancel>Keep battle</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete battle
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function MobileScoreboard({ view }: { view: BattleView }) {
  const sides = [0, 1].map((side) => view.players.filter((player) => player.side === side)).filter((players) => players.length)
  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-panel/98 px-3 py-2 backdrop-blur lg:hidden"
      aria-label="Battle scoreboard"
    >
      <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* min-w-0 on each cell, or a long list name widens the track instead of truncating. */}
        {sides.map((players, index) => (
          <div key={players[0].side} className={`min-w-0 ${index ? 'order-3 text-right' : 'order-1'}`}>
            <p className={`truncate text-xs font-bold uppercase ${SIDES[index]?.value}`}>
              {players.map((player) => player.name).join(' & ')}
            </p>
            <p className="truncate text-[0.625rem] text-dim">
              {players.map((player) => player.roster?.name ?? 'List not attached').join(' & ')}
            </p>
            <p className="readout text-xl">
              {players[0].primary + players[0].secondary + players.reduce((total, player) => total + player.paintedPoints, 0)}{' '}
              <span className="text-xs text-dim">VP · {players[0].cp} CP</span>
            </p>
            <div className="mt-1 flex gap-0.5" aria-label={`${players.map((player) => player.name).join(' and ')} rounds`}>
              {players[0].rounds.map((round) => (
                <span
                  key={round.round}
                  className={`h-1 flex-1 ${round.round <= view.round ? (index ? 'bg-side-b' : 'bg-side-a') : 'bg-edge-strong'}`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="order-2 text-center">
          <p className="eyebrow">Round</p>
          <p className="readout text-xl">{view.round}</p>
        </div>
      </div>
    </aside>
  )
}

type Award = {
  vp: number
  per: string | null
  mode: string | null
  when: string | null
  trigger: { phase: string | null; playerTurn: string | null; roundMin: number | null; roundMax: number | null }
}

const ANY: Award['trigger'] = { phase: null, playerTurn: null, roundMin: null, roundMax: null }

/** When a card's payouts are not known, plain steps are better than no way to score. */
const FALLBACK_AWARDS: Award[] = [
  { vp: 1, per: null, mode: null, when: null, trigger: ANY },
  { vp: 5, per: null, mode: null, when: null, trigger: ANY },
]

const pick = (awards: Award[]) => (awards.length ? awards : FALLBACK_AWARDS)

const awardTitle = (award: Award) =>
  [award.mode, award.when?.replaceAll('-', ' '), award.per ? `per ${award.per.replaceAll('-', ' ')}` : null].filter(Boolean).join(' · ') ||
  undefined

/** Opened on demand, so the account is not fetched on every change to the battle. */
/** The running account of the battle. Always open on a wide screen; the mobile tabs gate it instead. */
function ReportDetails({ token, players, hiddenOnMobile }: { token: string; players: ReportPlayer[]; hiddenOnMobile: boolean }) {
  return (
    <div className={`border-t border-edge pt-3 ${hiddenOnMobile ? 'hidden lg:block' : ''}`}>
      <p className="text-xs font-bold tracking-[0.08em] text-bone uppercase">Battle events</p>
      <Report token={token} open players={players} />
    </div>
  )
}

type ViewStratagem = BattleView['players'][number]['stratagems'][number]

/** The printed price, and the neighbouring ones a board state can move it to. */
function costChoices(printed: number) {
  return [printed - 1, printed, printed + 1, printed + 2].filter((cost) => cost >= 0 && cost <= STRATAGEM_CP_MAX)
}

/** The name opens what the stratagem is for; the button spends the CP. */
function StratagemCard({
  stratagem,
  actionable,
  pending,
  available,
  onUse,
}: {
  stratagem: ViewStratagem
  actionable: boolean
  pending: boolean
  available: number
  onUse: (cp?: number) => void
}) {
  const timing = [
    stratagem.phases?.length ? `${stratagem.phases.join(', ')} phase` : 'any phase',
    stratagem.turn === 'your-turn' ? 'your turn' : stratagem.turn === 'opponent-turn' ? "opponent's turn" : 'either turn',
    stratagem.limit === 'unlimited' ? 'no use limit' : `once per ${stratagem.limit}`,
  ].join(' · ')
  return (
    <div className={`${CARD} flex items-center gap-2 text-sm`}>
      <Dialog>
        <DialogTrigger
          render={
            <button
              type="button"
              aria-label={`About ${stratagem.name}`}
              className={`min-w-0 flex-1 text-left ${CARD_NAME} hover:underline`}
            />
          }
        >
          {stratagem.name}
        </DialogTrigger>
        <DialogContent className="border border-edge bg-panel text-bone">
          <DialogHeader>
            <DialogTitle className="uppercase">{stratagem.name}</DialogTitle>
            <DialogDescription className="text-dim">{timing}</DialogDescription>
          </DialogHeader>
          <p className="readout text-sm text-dim">
            {stratagem.cp} CP · used {stratagem.uses}x
          </p>
          {stratagem.refusal ? <p className="text-sm text-discarded">{stratagem.refusal}</p> : null}
        </DialogContent>
      </Dialog>
      <span className={`${CP_PILL} ${stratagem.refusal ? 'bg-edge text-dim' : ''}`}>{stratagem.cp} CP</span>
      {actionable ? (
        <>
          {/* Some stratagems cost more or less depending on what is on the board, so the price is a choice. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Spend a different amount on ${stratagem.name}`}
              className="grid size-7 shrink-0 place-items-center text-dim hover:text-bone"
            >
              <EllipsisVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {costChoices(stratagem.cp).map((cost) => (
                <DropdownMenuItem key={cost} disabled={pending || cost > available} onClick={() => onUse(cost)}>
                  Use for {cost} CP
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pending || stratagem.refusal !== null}
            title={stratagem.refusal ?? undefined}
            aria-label={`Use ${stratagem.name}`}
            onClick={() => onUse()}
          >
            <Zap />
          </Button>
        </>
      ) : null}
    </div>
  )
}

/** A stratagem with no phases named is one that can be played whenever its other timing allows. */
function playableIn(stratagem: ViewStratagem, phase: Phase) {
  return !stratagem.phases?.length || stratagem.phases.includes(phase)
}

function hiddenThisPhase(stratagems: readonly ViewStratagem[], phase: Phase) {
  return stratagems.filter((stratagem) => !playableIn(stratagem, phase)).length
}

function stratagemGroups(stratagems: readonly ViewStratagem[], coreKeys: ReadonlySet<string>) {
  return [
    { label: 'Detachment stratagems', items: stratagems.filter((stratagem) => !coreKeys.has(stratagem.key)) },
    { label: 'Core stratagems', items: stratagems.filter((stratagem) => coreKeys.has(stratagem.key)) },
  ].filter((group) => group.items.length)
}

/** What the list actually costs, summed from the units as submitted. */
function rosterPoints(roster: BattleView['players'][number]['roster']) {
  const units = roster?.built?.units
  if (!units?.length) return ''
  return `${units.reduce((total, unit) => total + unit.points, 0)} pts`
}

function rosterLine(roster: BattleView['players'][number]['roster']) {
  if (!roster) return 'No list'
  const detachment = roster.built?.detachment
  return detachment && !roster.name.includes(detachment) ? `${roster.name} · ${detachment}` : roster.name
}

function outcome(view: BattleView) {
  const sides = [0, 1].map((side) => ({
    players: view.players.filter((player) => player.side === side),
    total: view.players.find((player) => player.side === side)?.primary ?? 0,
  }))
  for (const side of sides)
    side.total += (side.players[0]?.secondary ?? 0) + side.players.reduce((total, player) => total + player.paintedPoints, 0)
  if (view.result?.reason === 'conceded') {
    const concededSide = view.players.find((player) => player.id === view.result?.concededBy)?.side
    const winner = sides.find((side) => side.players[0]?.side !== concededSide)
    return winner ? `${winner.players.map((player) => player.name).join(' & ')} win by concession` : 'Battle conceded'
  }
  const [first, second] = sides.toSorted((left, right) => right.total - left.total)
  if (!first) return 'No result'
  if (!second) return `Final score ${first.total}`
  return first.total === second.total
    ? `Drawn at ${first.total}`
    : `${first.players.map((player) => player.name).join(' & ')} win ${first.total}–${second.total}`
}

function resultLabel(view: BattleView) {
  if (!view.result) return null
  if (view.result.reason === 'conceded') {
    return `${view.players.find((player) => player.id === view.result?.concededBy)?.name ?? 'A player'} conceded`
  }
  return view.result.reason === 'finished-early' ? 'Finished early' : 'Completed'
}

function randomEntry<T>(entries: readonly T[]) {
  return entries[randomIndex(entries.length)]
}

function randomIndex(length: number) {
  if (!length) return 0
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return (value[0] ?? 0) % length
}
