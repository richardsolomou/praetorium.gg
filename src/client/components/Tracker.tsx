import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Skull, Undo2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { detachmentRulesQuery } from '../queries'
import type { BattleView, Command } from '../../core/battle'
import type { PresentPlayer } from '../../server/presence'
import { Prep } from './Prep'

type Props = { view: BattleView; present: PresentPlayer[]; send: (command: Command) => void; pending: boolean; problem: string | null }

/** Side 0 is the player who opened the battle. The tint is how you tell whose number you are reading. */
const SIDES = [
  { accent: 'border-l-steel', value: 'text-steel' },
  { accent: 'border-l-rust', value: 'text-rust' },
]

export function Tracker({ view, present, send, pending, problem }: Props) {
  const you = view.players.find((player) => player.isViewer)
  const built = you?.roster?.built
  // The cards say what they pay out, so the interface can offer the figure instead
  // of asking a player to work it out.
  const { data: rules } = useQuery(detachmentRulesQuery(built?.catalogueId ?? '', built?.detachment ?? ''))
  const awardsFor = (key: string) =>
    [...(rules?.secondaries ?? []), ...(rules?.primaries ?? [])].find((card) => card.key === key)?.awards ?? []
  const yourTurn = view.activePlayerId === view.viewerId
  const active = view.players.find((player) => player.isActive)
  const finished = view.status === 'finished'

  return (
    <main className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-edge pb-3">
        <div>
          <p className="eyebrow">{finished ? 'Battle over' : `Round ${view.round} of ${view.rounds}`}</p>
          <h1 className="mt-1 text-2xl capitalize">{finished ? outcome(view) : `${view.phase} phase`}</h1>
        </div>
        {finished ? null : (
          <p className="text-sm text-dim">
            {yourTurn ? <span className="text-amber">Your turn</span> : `${active?.name ?? 'Nobody'}’s turn`}
          </p>
        )}
      </header>

      <div className="grid items-start gap-3 sm:grid-cols-2">
        {view.players.map((player, index) => (
          <section
            key={player.id}
            className={`space-y-3 rounded-lg border border-edge border-l-2 bg-panel p-4 ${SIDES[index]?.accent ?? ''} ${
              player.isActive ? 'ring-2 ring-amber/50' : ''
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
                  present.some((watcher) => watcher.playerId === player.id) ? 'bg-amber' : 'border border-dim/60'
                }`}
                title={present.some((watcher) => watcher.playerId === player.id) ? 'Watching now' : 'Not on the page'}
              />
            </div>

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
                label={`Primary`}
                guide={view.guides.primary}
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

            {player.primaryCard ? (
              <div className="space-y-1 border-t border-edge pt-3">
                <p className="eyebrow">Primary — {player.primaryCard.name}</p>
                {player.isViewer && !finished ? (
                  <div className="flex flex-wrap gap-1">
                    {(awardsFor(player.primaryCard.key).length ? awardsFor(player.primaryCard.key) : FALLBACK_AWARDS).map((award) => (
                      <Button
                        key={`${award.vp}-${award.per ?? ''}-${award.mode ?? ''}`}
                        variant="outline"
                        size="icon-sm"
                        className="w-auto px-1.5"
                        disabled={pending}
                        title={awardTitle(award)}
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
                  <div key={secondary.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{secondary.name}</span>
                    <span className="readout w-6 text-right text-dim">{secondary.points}</span>
                    {player.isViewer && !finished ? (
                      <span className="flex shrink-0 flex-wrap gap-1">
                        {(awardsFor(secondary.key).length ? awardsFor(secondary.key) : FALLBACK_AWARDS).map((award) => (
                          <Button
                            key={`${award.vp}-${award.per ?? ''}-${award.mode ?? ''}`}
                            variant="outline"
                            size="icon-sm"
                            className="w-auto px-1.5"
                            disabled={pending}
                            title={awardTitle(award)}
                            aria-label={`${secondary.name} plus ${award.vp}${award.per ? ` per ${award.per.replaceAll('-', ' ')}` : ''}`}
                            onClick={() => send({ kind: 'score-secondary', key: secondary.key, delta: award.vp })}
                          >
                            +{award.vp}
                            {award.per ? <span className="ml-0.5 text-[0.625rem] opacity-70">ea</span> : null}
                          </Button>
                        ))}
                      </span>
                    ) : null}
                  </div>
                ))}
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
                      <span className={`truncate ${unit.destroyed ? 'text-dim line-through' : ''}`}>{unit.name}</span>
                      {player.isViewer && !finished ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${unit.destroyed ? 'Bring back' : 'Lose'} ${unit.name}`}
                          disabled={pending}
                          onClick={() => send({ kind: 'set-unit', unitKey: unit.key, destroyed: !unit.destroyed })}
                        >
                          {unit.destroyed ? <RotateCcw /> : <Skull />}
                        </Button>
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
      </div>

      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}

      {finished ? null : (
        <footer className="flex flex-wrap items-center gap-2 border-t border-edge pt-4">
          <Button
            // Not the primary action when it is not yours to take: a dimmed amber
            // button still reads as the thing to press.
            variant={yourTurn ? 'default' : 'outline'}
            className="h-11 flex-1 text-base"
            disabled={!yourTurn || pending}
            onClick={() => send({ kind: 'advance' })}
            title={yourTurn ? undefined : 'Only the player taking the turn can end a phase'}
          >
            {view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`}
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={view.undoable === null || pending}
            onClick={() => view.undoable !== null && send({ kind: 'undo', target: view.undoable })}
          >
            <Undo2 />
            Undo
          </Button>
          <Button variant="destructive" className="h-11" disabled={pending} onClick={() => send({ kind: 'end-battle' })}>
            End battle
          </Button>
        </footer>
      )}

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
    </main>
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

type Award = { vp: number; per: string | null; mode: string | null; when: string | null }

/** When a card's payouts are not known, plain steps are better than no way to score. */
const FALLBACK_AWARDS: Award[] = [
  { vp: 1, per: null, mode: null, when: null },
  { vp: 5, per: null, mode: null, when: null },
]

const awardTitle = (award: Award) =>
  [award.mode, award.when?.replaceAll('-', ' '), award.per ? `per ${award.per.replaceAll('-', ' ')}` : null].filter(Boolean).join(' · ') ||
  undefined

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
