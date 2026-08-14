import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Dice5, Maximize2, Pause, Play, RotateCcw, Skull, Undo2, Zap } from 'lucide-react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { UNIT_FORMATIONS } from '../../core/battle'
import { deleteBattle, savedRosterPrice } from '../../server/functions'
import { battleQuery, battlesQuery, deploymentsQuery, detachmentRulesQuery, gameReferencesQuery, savedRostersQuery } from '../queries'
import { errorMessage } from '../queryClient'
import type { BattleView, Command } from '../../core/battle'
import type { PresentPlayer } from '../useLiveBattle'
import { BattlefieldReference } from './Battlefield'
import { Disclosure } from './Disclosure'
import { battleRoster, savedBattlePrep } from './Setup'
import { Report } from './Report'
import { Prep } from './Prep'

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

export function Tracker({ view, mission, present, send, pending, problem }: Props) {
  const [mobileTab, setMobileTab] = useState<'info' | 'events'>('info')
  const [dieResult, setDieResult] = useState<{ sides: number; value: number } | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [keepAwake, setKeepAwake] = useState(false)
  const you = view.players.find((player) => player.isViewer)
  const built = you?.roster?.built
  // The cards say what they pay out, so the interface can offer the figure instead
  // of asking a player to work it out.
  const detachmentNames = built?.detachments?.map((detachment) => detachment.name) ?? (built?.detachment ? [built.detachment] : [])
  const { data: rules } = useQuery(detachmentRulesQuery(built?.catalogueId ?? '', detachmentNames))
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const deployment = deployments?.find((entry) => entry.id === view.deploymentId)
  const missionPack = references?.packs.find((entry) => entry.id === view.settings.missionPackId)
  const terrain = references?.terrainLayouts.find((entry) => entry.id === view.settings.terrainLayoutId)
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
    if (trigger.playerTurn === 'your-turn' && view.activePlayerId !== view.viewerId) return 'on your own turn'
    if (trigger.phase && trigger.phase !== view.phase) return `in the ${trigger.phase} phase`
    if (trigger.roundMin !== null && view.round < trigger.roundMin) return `from round ${trigger.roundMin}`
    if (trigger.roundMax !== null && view.round > trigger.roundMax) return `up to round ${trigger.roundMax}`
    return null
  }
  const yourTurn = view.activePlayerId === view.viewerId
  const active = view.players.find((player) => player.isActive)
  const finished = view.status === 'finished'
  const wakeLockAvailable = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  useEffect(() => {
    if (!keepAwake || !('wakeLock' in navigator)) return
    let disposed = false
    let requesting = false
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      if (disposed || requesting || lock || document.visibilityState !== 'visible') return
      requesting = true
      try {
        const held = await navigator.wakeLock.request('screen')
        if (disposed || document.visibilityState !== 'visible') {
          await held.release()
          return
        }
        lock = held
        held.addEventListener('release', () => {
          if (lock === held) lock = null
        })
      } catch {
        if (!disposed) setKeepAwake(false)
      } finally {
        requesting = false
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', visible)
    void acquire()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', visible)
      const held = lock
      lock = null
      void held?.release()
    }
  }, [keepAwake])

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-4 px-4 pt-6 pb-36 lg:pb-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-edge pb-3">
        <div>
          <p className="eyebrow">
            {finished ? 'Battle over' : `Round ${view.round} of ${view.rounds}`}
            {mission ? ` · ${mission.name}` : ''}
          </p>
          <h1 className="mt-1 text-2xl capitalize">{finished ? outcome(view) : `${view.phase} phase`}</h1>
          <p className="mt-1 text-xs text-dim">
            {[
              view.settings.limit ? `${view.settings.limit} points` : null,
              missionPack?.name,
              terrain?.name,
              view.attackerId ? `${view.players.find((player) => player.id === view.attackerId)?.name ?? 'Unknown'} attacking` : null,
              resultLabel(view),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {finished ? null : (
          <p className="text-sm text-dim">
            {yourTurn ? <span className="text-azure">Your turn</span> : `${active?.name ?? 'Nobody'}’s turn`}
          </p>
        )}
      </header>

      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_18rem_minmax(0,1fr)]">
        {view.players.map((player, index) => (
          <section
            key={player.id}
            className={`${mobileTab === 'events' ? 'hidden lg:block' : ''} space-y-3 rounded-lg border border-edge border-l-2 bg-panel p-4 lg:row-start-1 ${index === 0 ? 'lg:col-start-1' : 'lg:col-start-3'} ${SIDES[index]?.accent ?? ''} ${
              player.isActive ? 'ring-2 ring-azure/50' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {player.name}
                  {player.isViewer ? <span className="ml-1.5 text-xs text-dim">you</span> : null}
                </p>
                {/* The list names itself after its detachment, so appending it would say it twice. */}
                <p className="truncate text-xs text-dim">{rosterLine(player.roster)}</p>
              </div>
              <span
                className={`size-2 shrink-0 rounded-full ${
                  present.some((watcher) => watcher.playerId === player.id) ? 'bg-azure' : 'border border-dim/60'
                }`}
                title={present.some((watcher) => watcher.playerId === player.id) ? 'Watching now' : 'Not on the page'}
              />
            </div>

            <p className="readout text-[0.6875rem] text-faint">
              CP {player.cpGained} gained · {player.cpSpent} used · {player.cp} remaining
            </p>

            {view.clock.limitMinutes !== null ? (
              <PlayerClock
                key={`${player.id}-${view.seq}`}
                used={player.clockMilliseconds}
                remaining={player.clockRemainingMilliseconds}
                running={view.clock.runningPlayerId === player.id && !view.clock.paused}
              />
            ) : null}

            {/* Each stat's controls sit under the number they change, so nothing is labelled twice. */}
            <div className="grid grid-cols-3 gap-2 border-t border-edge pt-3">
              <Stat
                label="CP"
                value={player.cp}
                tint={SIDES[index]?.value}
                pending={pending}
                onStep={player.isViewer && !finished ? (delta) => send({ kind: 'adjust-cp', delta }) : undefined}
              />
              <Stat
                label="Primary"
                guide={mission?.gameCap ?? view.guides.primary}
                value={player.primary}
                tint={SIDES[index]?.value}
                pending={pending}
                fives
                // A chosen primary card is scored by its own payouts below.
                onStep={
                  player.isViewer && !finished && !player.primaryCard
                    ? (delta) => send({ kind: 'score', category: 'primary', delta })
                    : undefined
                }
              />
              <Stat
                label="Secondary"
                guide={view.guides.secondary}
                value={player.secondary}
                tint={SIDES[index]?.value}
                pending={pending}
                fives
                // Named secondaries are scored by name, so the pile control goes away.
                onStep={
                  player.isViewer && !finished && !player.secondaries.length
                    ? (delta) => send({ kind: 'score', category: 'secondary', delta })
                    : undefined
                }
              />
            </div>

            <p className="flex items-baseline justify-between border-t border-edge pt-3">
              <span className="eyebrow">Victory points</span>
              <span data-stat="vp" className="readout text-xl">
                {player.total}
              </span>
            </p>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={player.painted ? 'text-achieved' : 'text-dim'}>
                Battle ready {player.painted ? `· +${player.paintedPoints} VP` : '· no bonus'}
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

            {player.primaryCard ? (
              <div className="space-y-1 border-t border-edge pt-3">
                <p className="eyebrow">Primary — {player.primaryCard.name}</p>
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

            {player.secondaries.length ? (
              <div className="space-y-1 border-t border-edge pt-3">
                <p className="eyebrow">Secondaries</p>
                {player.secondaries.map((secondary) => (
                  <div key={secondary.key} data-secondary={secondary.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {secondary.name}
                      {secondary.secret ? (
                        <span className="ml-1.5 text-[0.625rem] font-semibold uppercase text-azure">
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
                      <span className="readout mt-0.5 block text-[0.625rem] text-faint">
                        {secondary.rounds.map((points, round) => `T${round + 1} ${points}`).join(' · ')}
                      </span>
                    </span>
                    <span className="readout w-6 text-right text-dim">{secondary.points}</span>
                    {player.isViewer && !finished && secondary.status === 'active' ? (
                      <span className="flex shrink-0 flex-wrap gap-1">
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
                  <Disclosure label="Draw a replacement" className="pt-1" triggerClassName="eyebrow text-azure">
                    <div className="mt-1 space-y-2">
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
                  </Disclosure>
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
            ) : null}

            {player.stratagems.length ? (
              <div className="space-y-1 border-t border-edge pt-3">
                <p className="eyebrow">Stratagems</p>
                {player.stratagems.map((stratagem) => (
                  <div key={stratagem.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className={`min-w-0 flex-1 ${stratagem.refusal ? 'text-dim' : ''}`}>
                      <span className="block truncate">{stratagem.name}</span>
                      {player.isViewer && stratagem.refusal ? (
                        <span className="block truncate text-[0.625rem] text-faint">{stratagem.refusal}</span>
                      ) : null}
                    </span>
                    <span className="readout shrink-0 text-xs text-dim">
                      {stratagem.cp} CP · {stratagem.uses}x
                    </span>
                    {player.isViewer && !finished ? (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={pending || stratagem.refusal !== null}
                        title={stratagem.refusal ?? undefined}
                        aria-label={`Use ${stratagem.name}`}
                        onClick={() => send({ kind: 'use-stratagem', key: stratagem.key })}
                      >
                        <Zap />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {player.units.length ? (
              <div className="border-t border-edge pt-3">
                <p className="flex items-baseline justify-between">
                  <span className="eyebrow">On the table</span>
                  <span data-stat="standing" className="readout text-xs text-dim">
                    {player.standing}/{player.units.length}
                  </span>
                </p>
                <ul className="mt-1 divide-y divide-edge">
                  {player.units.map((unit) => (
                    <li key={unit.key} className="space-y-1 py-1 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`min-w-0 flex-1 truncate ${unit.destroyed ? 'text-dim line-through' : ''}`}>
                          {unit.name}
                          {unit.models > 1 && !unit.destroyed ? (
                            <span className="readout ml-1.5 text-xs text-dim">
                              {unit.alive}/{unit.models}
                            </span>
                          ) : null}
                          {!unit.destroyed ? (
                            <span className="ml-1.5 text-[0.625rem] text-dim">{unit.formation.replaceAll('-', ' ')}</span>
                          ) : null}
                        </span>
                        {player.isViewer && !finished ? (
                          <span className="flex shrink-0 gap-1">
                            {unit.models > 1 && !unit.destroyed ? (
                              <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label={`Lose a model from ${unit.name}`}
                                disabled={pending}
                                onClick={() => send({ kind: 'wound-unit', unitKey: unit.key, delta: -1 })}
                              >
                                −1
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${unit.destroyed ? 'Bring back' : 'Lose'} ${unit.name}`}
                              disabled={pending}
                              onClick={() => send({ kind: 'set-unit', unitKey: unit.key, destroyed: !unit.destroyed })}
                            >
                              {unit.destroyed ? <RotateCcw /> : <Skull />}
                            </Button>
                          </span>
                        ) : (
                          <span className="readout shrink-0 text-xs text-dim">{unit.points}</span>
                        )}
                      </div>
                      {player.isViewer && !finished && !unit.destroyed ? (
                        <div className="flex flex-wrap gap-1">
                          {UNIT_FORMATIONS.filter(
                            (formation) =>
                              formation === 'battlefield' ||
                              formation === 'strategic-reserves' ||
                              unit.formationOptions?.includes(formation),
                          ).map((formation) => (
                            <Button
                              key={formation}
                              variant={unit.formation === formation ? 'default' : 'outline'}
                              size="xs"
                              disabled={pending}
                              onClick={() => send({ kind: 'set-unit-formation', unitKey: unit.key, formation })}
                            >
                              {formation.replaceAll('-', ' ')}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
              <p className="eyebrow">{finished ? 'Final result' : 'Now'}</p>
              <p className="mt-1 text-xl font-bold uppercase">{finished ? outcome(view) : `${view.phase} phase`}</p>
              <p className="mt-1 text-xs text-dim">
                Round {view.round} · {mission?.name ?? 'Matched play'}
              </p>
              {deployment ? (
                <p className="mt-1 text-xs text-dim" title={deployment.description ?? undefined}>
                  {deployment.name} · {deployment.objectives.length} objectives
                </p>
              ) : null}
            </div>
            {deployment ? (
              <BattlefieldReference
                deployment={deployment}
                terrain={terrain}
                templates={references?.terrainTemplates ?? []}
                className="mt-3"
              />
            ) : null}
            <ScoreChart players={view.players} />
            <CpChart players={view.players} />
            <TurnTiming turns={view.turns} />
          </div>
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
              {view.clock.limitMinutes !== null ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => send({ kind: view.clock.paused ? 'resume-clock' : 'pause-clock' })}
                >
                  {view.clock.paused ? <Play /> : <Pause />}
                  {view.clock.paused ? 'Resume clocks' : 'Pause clocks'}
                </Button>
              ) : null}
              <AdvanceControl view={view} pending={pending} yourTurn={yourTurn} send={send} />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={view.undoable === null || pending}
                  onClick={() => view.undoable !== null && send({ kind: 'undo', target: view.undoable })}
                >
                  <Undo2 /> Undo
                </Button>
                <EndBattleDialog
                  pending={pending}
                  label="Finish early"
                  onConfirm={() => send({ kind: 'end-battle', reason: 'finished-early' })}
                />
              </div>
              <EndBattleDialog
                pending={pending}
                label="Concede battle"
                description="This records that you conceded and ends the battle for both players."
                onConfirm={() => send({ kind: 'end-battle', reason: 'conceded', concededBy: view.viewerId })}
              />
            </div>
          )}
          <Disclosure label="Score corrections" className="border-t border-edge pt-3 text-sm text-dim">
            <CorrectionControls view={view} send={send} pending={pending} />
          </Disclosure>
          <Disclosure label="Table tools" className="border-t border-edge pt-3 text-sm text-dim">
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[3, 6].map((sides) => (
                <Button key={sides} variant="outline" onClick={() => setDieResult({ sides, value: randomIndex(sides) + 1 })}>
                  <Dice5 /> D{sides}
                </Button>
              ))}
              <Button
                variant={fullscreen ? 'default' : 'outline'}
                onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
              >
                <Maximize2 /> {fullscreen ? 'Exit full screen' : 'Full screen'}
              </Button>
              <Button
                variant={keepAwake ? 'default' : 'outline'}
                disabled={!wakeLockAvailable}
                onClick={() => setKeepAwake((current) => !current)}
              >
                {keepAwake ? 'Screen stays awake' : 'Keep screen awake'}
              </Button>
            </div>
            {dieResult ? (
              <p className="readout mt-2 text-center text-xl" aria-live="polite">
                D{dieResult.sides} rolled {dieResult.value}
              </p>
            ) : null}
          </Disclosure>
          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
          {remove.error ? <p className="text-sm text-destructive">{errorMessage(remove.error)}</p> : null}
          <ReportDetails token={view.token} forceOpen={mobileTab === 'events'} />
          {view.creatorId === view.viewerId ? <DeleteBattleDialog pending={remove.isPending} onConfirm={() => remove.mutate()} /> : null}
        </section>
      </div>

      <Disclosure label="Stratagems and secondaries" className="text-sm text-dim">
        <div className="mt-3 rounded-lg border border-edge bg-panel p-4">
          <Prep view={view} send={send} pending={pending} />
        </div>
      </Disclosure>

      <Disclosure label="Lists" className="text-sm text-dim">
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {view.players.map((player) => (
            <div key={player.id} className="rounded-lg border border-edge bg-panel p-3">
              <p className="eyebrow">{player.name}</p>
              <pre className="readout mt-2 text-xs whitespace-pre-wrap text-bone">{player.roster?.text ?? '—'}</pre>
            </div>
          ))}
        </div>
        <RosterReplacement view={view} send={send} pending={pending} />
      </Disclosure>
      <MobileScoreboard view={view} />
    </main>
  )
}

function PlayerClock({ used, remaining, running }: { used: number; remaining: number | null; running: boolean }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setElapsed((current) => current + 1000), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const left = remaining === null ? null : Math.max(0, remaining - elapsed)
  return (
    <p className={`readout text-xs ${left !== null && left <= 5 * 60_000 ? 'text-destructive' : 'text-dim'}`}>
      Clock {left === null ? `${clockTime(used + elapsed)} used` : `${clockTime(left)} left`} {running ? '· running' : ''}
    </p>
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

function CorrectionControls({ view, send, pending }: { view: BattleView; send: (command: Command) => void; pending: boolean }) {
  return (
    <div className="mt-2 space-y-3">
      {view.players.map((player) => (
        <div key={player.id} className="space-y-1 border-t border-edge pt-2">
          <p className="eyebrow">{player.name}</p>
          {(['cp', 'primary', 'secondary'] as const).map((resource) => (
            <div key={resource} className="grid grid-cols-[1fr_repeat(3,2.25rem)] items-center gap-1">
              <span className="capitalize">{resource}</span>
              {[-1, 1, 5].map((delta) => (
                <Button
                  key={delta}
                  variant="outline"
                  size="icon-sm"
                  disabled={pending || (delta < 0 && player[resource] < Math.abs(delta))}
                  onClick={() => send({ kind: 'correct-player', playerId: player.id, resource, delta })}
                  aria-label={`Correct ${player.name} ${resource} by ${delta}`}
                >
                  {delta > 0 ? '+' : '−'}
                  {Math.abs(delta)}
                </Button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
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

function RosterReplacement({ view, send, pending }: { view: BattleView; send: (command: Command) => void; pending: boolean }) {
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const eligible = view.settings.limit === null ? saved : saved.filter((roster) => roster.limit === view.settings.limit)
  const replace = useMutation({
    mutationFn: async (savedRoster: (typeof saved)[number]) => {
      const priced = await savedRosterPrice({ data: { id: savedRoster.id } })
      if (!priced) throw new Error('That roster could not be loaded.')
      return { roster: battleRoster(savedRoster, priced), prep: savedBattlePrep(savedRoster) }
    },
    onSuccess: ({ roster, prep }) => send({ kind: 'attach-roster', roster, prep }),
  })
  if (view.status === 'finished') return null
  return (
    <Disclosure label="Replace my roster" className="mt-3 text-sm text-dim">
      <div className="mt-2 flex flex-wrap gap-2">
        {eligible.map((roster) => (
          <Button
            key={roster.id}
            variant="outline"
            size="sm"
            disabled={pending || replace.isPending}
            onClick={() => replace.mutate(roster)}
          >
            {roster.name}
          </Button>
        ))}
        {!eligible.length ? <p className="text-xs text-dim">No saved roster matches this battle size.</p> : null}
      </div>
      {replace.error ? <p className="mt-2 text-sm text-destructive">{errorMessage(replace.error)}</p> : null}
    </Disclosure>
  )
}

function ScoreChart({ players }: { players: BattleView['players'] }) {
  const cumulative = players.map((player) => {
    let total = 0
    return player.rounds.map((round) => (total += round.total))
  })
  const max = Math.max(1, ...cumulative.flat())
  const points = (scores: number[]) => scores.map((score, at) => `${at * 55 + 10},${60 - (score / max) * 50}`).join(' ')
  return (
    <div className="border-y border-edge py-2">
      <p className="eyebrow mb-1">Victory points</p>
      <svg viewBox="0 0 240 66" className="w-full">
        <title>Cumulative victory points by round</title>
        <path d="M10 60H230" className="stroke-edge" />
        {cumulative[0] ? <polyline points={points(cumulative[0])} fill="none" className="stroke-side-a" strokeWidth="2" /> : null}
        {cumulative[1] ? <polyline points={points(cumulative[1])} fill="none" className="stroke-side-b" strokeWidth="2" /> : null}
      </svg>
    </div>
  )
}

function CpChart({ players }: { players: BattleView['players'] }) {
  const max = Math.max(1, ...players.flatMap((player) => player.cpByRound))
  const points = (scores: number[]) => scores.map((score, at) => `${at * 55 + 10},${44 - (score / max) * 34}`).join(' ')
  return (
    <div className="border-b border-edge py-2">
      <p className="eyebrow mb-1">Command points by round</p>
      <svg viewBox="0 0 240 50" className="w-full">
        <title>Command points remaining by round</title>
        <path d="M10 44H230" className="stroke-edge" />
        {players[0] ? <polyline points={points(players[0].cpByRound)} fill="none" className="stroke-side-a" strokeWidth="2" /> : null}
        {players[1] ? <polyline points={points(players[1].cpByRound)} fill="none" className="stroke-side-b" strokeWidth="2" /> : null}
      </svg>
    </div>
  )
}

function TurnTiming({ turns }: { turns: BattleView['turns'] }) {
  const completed = turns.filter((turn) => turn.minutes !== null)
  if (!completed.length) return null
  return (
    <div className="border-b border-edge py-2">
      <p className="eyebrow mb-1">Minutes per turn</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {completed.map((turn) => (
          <p key={`${turn.round}-${turn.playerId}`} className="flex justify-between gap-2">
            <span className="truncate text-dim">
              R{turn.round} · {turn.playerName}
            </span>
            <span className="readout">{turn.minutes}m</span>
          </p>
        ))}
      </div>
    </div>
  )
}

function MobileScoreboard({ view }: { view: BattleView }) {
  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-panel/98 px-3 py-2 backdrop-blur lg:hidden"
      aria-label="Battle scoreboard"
    >
      <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-3">
        {view.players.map((player, index) => (
          <div key={player.id} className={index ? 'order-3 text-right' : 'order-1'}>
            <p className={`truncate text-xs font-bold uppercase ${SIDES[index]?.value}`}>{player.name}</p>
            <p className="truncate text-[0.625rem] text-dim">{player.roster?.name ?? 'List not attached'}</p>
            <p className="readout text-xl">
              {player.total} <span className="text-xs text-dim">VP · {player.cp} CP</span>
            </p>
            <div className="mt-1 flex gap-0.5" aria-label={`${player.name} rounds`}>
              {player.rounds.map((round) => (
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

type StatProps = {
  label: string
  /** The conventional ceiling, shown quietly beside the number and never enforced. */
  guide?: number
  value: number
  tint?: string
  pending: boolean
  /** Absent on the opponent's panel: the controls are the ownership rule, made visible. */
  onStep?: (delta: number) => void
  /** Victory points move in fives often enough to be worth a button. */
  fives?: boolean
}

function Stat({ label, guide, value, tint, pending, onStep, fives }: StatProps) {
  const steps = fives ? [-1, 1, 5] : [-1, 1]
  return (
    <div>
      <p className="eyebrow">{label}</p>
      {/* `data-stat` is how a test reads one player's number without depending on where it sits. */}
      <p data-stat={label.toLowerCase()} className={`readout mt-0.5 text-3xl leading-none ${tint ?? ''}`}>
        {value}
      </p>
      {guide ? <p className="readout mt-0.5 text-[0.625rem] text-dim">of {guide}</p> : null}
      {onStep ? (
        // A keypad rather than a row: a column is only ever a third of the panel,
        // and three buttons abreast in it are too narrow for a thumb.
        <div className="mt-2 grid grid-cols-2 gap-1">
          {steps.map((step) => (
            <Button
              key={step}
              variant="outline"
              className={`h-9 w-full px-0 ${Math.abs(step) === 5 ? 'col-span-2' : ''}`}
              disabled={pending}
              onClick={() => onStep(step)}
              aria-label={`${label} ${step < 0 ? 'minus' : 'plus'} ${Math.abs(step)}`}
            >
              {step < 0 ? '−' : '+'}
              {Math.abs(step)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
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
function ReportDetails({ token, forceOpen = false }: { token: string; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Disclosure
      label="How the battle went"
      className="text-sm text-dim"
      triggerClassName={forceOpen ? 'hidden lg:flex' : undefined}
      open={forceOpen || open}
      onOpenChange={setOpen}
    >
      <Report token={token} open={forceOpen || open} />
    </Disclosure>
  )
}

function rosterLine(roster: BattleView['players'][number]['roster']) {
  if (!roster) return 'No list'
  const detachment = roster.built?.detachment
  return detachment && !roster.name.includes(detachment) ? `${roster.name} · ${detachment}` : roster.name
}

function outcome(view: BattleView) {
  if (view.result?.reason === 'conceded') {
    const winner = view.players.find((player) => player.id !== view.result?.concededBy)
    return winner ? `${winner.name} wins by concession` : 'Battle conceded'
  }
  const [first, second] = view.players.toSorted((left, right) => right.total - left.total)
  if (!first) return 'No result'
  if (!second) return `Final score ${first.total}`
  return first.total === second.total ? `Drawn at ${first.total}` : `${first.name} wins ${first.total}–${second.total}`
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

function clockTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}
