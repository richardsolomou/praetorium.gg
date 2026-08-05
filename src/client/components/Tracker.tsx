import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowDownToLine, RotateCcw, Skull, Undo2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deploymentsQuery, detachmentRulesQuery } from '../queries'
import type { BattleView, Command } from '../../core/battle'
import type { PresentPlayer } from '../../server/presence'
import { Prep } from './Prep'
import { Report } from './Report'

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

export function Tracker({ view, mission, present, send, pending, problem }: Props) {
  const [mobileTab, setMobileTab] = useState<'info' | 'events'>('info')
  const you = view.players.find((player) => player.isViewer)
  const built = you?.roster?.built
  // The cards say what they pay out, so the interface can offer the figure instead
  // of asking a player to work it out.
  const { data: rules } = useQuery(detachmentRulesQuery(built?.catalogueId ?? '', built?.detachment ?? ''))
  const { data: deployments } = useQuery(deploymentsQuery())
  const deployment = deployments?.find((entry) => entry.id === view.deploymentId)
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

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-4 px-4 pt-6 pb-36 lg:pb-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-edge pb-3">
        <div>
          <p className="eyebrow">
            {finished ? 'Battle over' : `Round ${view.round} of ${view.rounds}`}
            {mission ? ` · ${mission.name}` : ''}
          </p>
          <h1 className="mt-1 text-2xl capitalize">{finished ? outcome(view) : `${view.phase} phase`}</h1>
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
                  <details className="pt-1">
                    <summary className="eyebrow cursor-pointer text-azure">Draw a replacement</summary>
                    <div className="mt-1 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                      {(rules?.secondaries ?? [])
                        .filter((card) => !player.secondaries.some((held) => held.key === card.key))
                        .map((card) => (
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
                  </details>
                ) : null}
                {player.isViewer && !finished && !player.secondaries.some((card) => card.secret) ? (
                  <details className="pt-1">
                    <summary className="eyebrow cursor-pointer text-azure">Select secret mission</summary>
                    <div className="mt-1 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                      {(rules?.secondaries ?? [])
                        .filter((card) => !player.secondaries.some((held) => held.key === card.key))
                        .map((card) => (
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
                  </details>
                ) : null}
              </div>
            ) : null}

            {player.stratagems.length ? (
              <div className="space-y-1 border-t border-edge pt-3">
                <p className="eyebrow">Stratagems</p>
                {player.stratagems.map((stratagem) => (
                  <div key={stratagem.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className={`min-w-0 flex-1 truncate ${stratagem.refusal ? 'text-dim' : ''}`}>{stratagem.name}</span>
                    <span className="readout shrink-0 text-xs text-dim">{stratagem.cp} CP</span>
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
                    <li key={unit.key} className="flex items-center justify-between gap-2 py-1 text-sm">
                      <span className={`min-w-0 flex-1 truncate ${unit.destroyed ? 'text-dim line-through' : ''}`}>
                        {unit.name}
                        {unit.models > 1 && !unit.destroyed ? (
                          <span className="readout ml-1.5 text-xs text-dim">
                            {unit.alive}/{unit.models}
                          </span>
                        ) : null}
                        {!unit.deployed && !unit.destroyed ? <span className="ml-1.5 text-xs text-dim">in reserve</span> : null}
                      </span>
                      {player.isViewer && !finished ? (
                        <span className="flex shrink-0 gap-1">
                          {!unit.deployed && !unit.destroyed ? (
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Bring on ${unit.name}`}
                              disabled={pending}
                              onClick={() => send({ kind: 'deploy-unit', unitKey: unit.key, deployed: true })}
                            >
                              <ArrowDownToLine />
                            </Button>
                          ) : null}
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
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ))}

        <section className="order-first space-y-3 border border-edge bg-panel p-4 sm:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          <div className="grid grid-cols-2 border-b border-edge lg:hidden">
            {(['info', 'events'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`eyebrow border-b-2 py-2 ${mobileTab === tab ? 'border-azure text-azure' : 'border-transparent'}`}
                aria-pressed={mobileTab === tab}
                onClick={() => setMobileTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
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
            <ScoreChart players={view.players} />
            <CpChart players={view.players} />
            <TurnTiming turns={view.turns} />
          </div>
          {finished ? null : (
            <div className={`${mobileTab === 'events' ? 'hidden lg:block' : ''} space-y-2 border-t border-edge pt-3`}>
              <Button
                variant={yourTurn ? 'default' : 'outline'}
                className="h-11 w-full text-base"
                disabled={!yourTurn || pending}
                onClick={() => send({ kind: 'advance' })}
                title={yourTurn ? undefined : 'Only the player taking the turn can end a phase'}
              >
                {view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={view.undoable === null || pending}
                  onClick={() => view.undoable !== null && send({ kind: 'undo', target: view.undoable })}
                >
                  <Undo2 /> Undo
                </Button>
                <Button variant="destructive" disabled={pending} onClick={() => send({ kind: 'end-battle' })}>
                  End battle
                </Button>
              </div>
            </div>
          )}
          {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
          <ReportDetails token={view.token} forceOpen={mobileTab === 'events'} />
        </section>
      </div>

      <details className="text-sm text-dim">
        <summary className="cursor-pointer">Stratagems and secondaries</summary>
        <div className="mt-3 rounded-lg border border-edge bg-panel p-4">
          <Prep view={view} send={send} pending={pending} />
        </div>
      </details>

      <details className="text-sm text-dim">
        <summary className="cursor-pointer">Lists</summary>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {view.players.map((player) => (
            <div key={player.id} className="rounded-lg border border-edge bg-panel p-3">
              <p className="eyebrow">{player.name}</p>
              <pre className="readout mt-2 text-xs whitespace-pre-wrap text-bone">{player.roster?.text ?? '—'}</pre>
            </div>
          ))}
        </div>
      </details>
      <MobileScoreboard view={view} />
    </main>
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
    <details className="text-sm text-dim" open={forceOpen || undefined} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={`cursor-pointer ${forceOpen ? 'hidden lg:list-item' : ''}`}>How the battle went</summary>
      <Report token={token} open={forceOpen || open} />
    </details>
  )
}

function rosterLine(roster: BattleView['players'][number]['roster']) {
  if (!roster) return 'No list'
  const detachment = roster.built?.detachment
  return detachment && !roster.name.includes(detachment) ? `${roster.name} · ${detachment}` : roster.name
}

function outcome(view: BattleView) {
  const [first, second] = view.players.toSorted((left, right) => right.total - left.total)
  if (!first || !second) return 'No result'
  return first.total === second.total ? `Drawn at ${first.total}` : `${first.name} wins ${first.total}–${second.total}`
}
