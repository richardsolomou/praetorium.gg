import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/Dialog'
import { Choice } from '../../components/Choice'
import { Stepper } from '../../components/Stepper'
import { type BattleMoment, type Command, isNewOrders, type Phase, PHASES } from '../../../core/battle'
import { phaseName, stratagemTiming } from '../../../core/reminders'
import { type Side, sideName, sideOf } from '../../sides'
import type { SendCommand } from './useCommand'
import { stratagemVisibleNow } from './stratagemVisibility'
import { costChoices } from './Stratagems'

type Action = 'stratagem' | 'score' | 'cp'

const ACTIONS: { value: Action; name: string }[] = [
  { value: 'stratagem', name: 'Stratagem' },
  { value: 'score', name: 'Victory points' },
  { value: 'cp', name: 'CP gained' },
]

const PHASE_SHORT: Record<Phase, string> = {
  command: 'Cmd',
  movement: 'Move',
  shooting: 'Shoot',
  charge: 'Charge',
  fight: 'Fight',
  end: 'End',
}

const PRIMARY = 'primary'

/** Where the dialog opens: the battle menu names nothing, a stratagem card names its side and stratagem. */
export type MissedActionDraft = { sideIndex?: number; stratagemKey?: string }

type ViewStratagem = Side['stratagems'][number]

/**
 * Records an action the table forgot, against the earlier phase it belongs to.
 *
 * The domain judges it as of that phase and refuses what it cannot place safely, so
 * this only steers the choice away from phases a stratagem's printed timing rules out
 * and leaves the rest of legality to the refusal.
 */
export function MissedActionDialog({
  moments,
  table,
  draft,
  send,
  pending,
  onClose,
}: {
  moments: readonly BattleMoment[]
  table: readonly Side[]
  draft: MissedActionDraft
  send: SendCommand
  pending: boolean
  onClose: () => void
}) {
  const firstSide = table.find((side) => side.index === draft.sideIndex) ?? table.find((side) => side.isViewer) ?? table[0]
  const [sideIndex, setSideIndex] = useState(String(firstSide?.index ?? 0))
  const [action, setAction] = useState<Action>('stratagem')
  const [stratagemKey, setStratagemKey] = useState<string | null>(draft.stratagemKey ?? null)
  const [cp, setCp] = useState<number | null>(null)
  const [chosenMoment, setChosenMoment] = useState<number | null>(null)
  const [scoreKey, setScoreKey] = useState(PRIMARY)
  const [vp, setVp] = useState(1)

  const side = table.find((candidate) => String(candidate.index) === sideIndex) ?? table[0]
  const stratagems = side?.stratagems.filter((stratagem) => !isNewOrders(stratagem)) ?? []
  const stratagem = action === 'stratagem' ? stratagems.find((candidate) => candidate.key === stratagemKey) : undefined
  const cost = cp ?? stratagem?.cp ?? 0
  const cards = side?.secondaries.filter((card) => card.status === 'active' && card.key !== 'secret') ?? []

  const fits = (candidate: ViewStratagem | undefined, moment: BattleMoment) =>
    !candidate || !side || stratagemVisibleNow(candidate, moment.phase, sideOf(table, moment.turn)?.index === side.index)
  const latestFitting = (candidate: ViewStratagem | undefined) => moments.findLastIndex((moment) => fits(candidate, moment))
  // A choice the stratagem's timing rules out falls back to the latest phase it fits, so the record is always placeable.
  const momentAt =
    chosenMoment !== null && moments[chosenMoment] && fits(stratagem, moments[chosenMoment]) ? chosenMoment : latestFitting(stratagem)
  const moment = moments[momentAt]
  const turnName = (candidate: BattleMoment) => {
    const turn = sideOf(table, candidate.turn)
    return `${turn ? sideName(turn) : 'Unknown'}’s turn`
  }
  const label = (candidate: BattleMoment) => `Round ${candidate.round} · ${turnName(candidate)} · ${phaseName(candidate.phase)}`
  const turns = turnsOf(moments)

  const command = ((): Command | null => {
    if (!side || !moment) return null
    const target = { playerId: side.captain.id, missed: moment }
    if (action === 'cp') return { kind: 'adjust-cp', delta: 1, ...target }
    if (action === 'stratagem')
      return stratagem ? { kind: 'use-stratagem', key: stratagem.key, ...(cost === stratagem.cp ? {} : { cp: cost }), ...target } : null
    return {
      kind: 'score-settlement',
      scores: [scoreKey === PRIMARY ? { category: 'primary', delta: vp } : { category: 'secondary', key: scoreKey, delta: vp }],
      ...target,
    }
  })()

  const summary = (() => {
    if (!side) return null
    if (action === 'stratagem') return stratagem ? `${stratagem.name} for ${cost} CP` : null
    if (action === 'cp') return '1 CP gained'
    return `${vp} VP for ${scoreKey === PRIMARY ? 'the primary mission' : (cards.find((card) => card.key === scoreKey)?.name ?? 'a mission')}`
  })()

  const record = () => {
    if (!command) return
    // A refusal arrives as a toast and leaves the dialog open to correct it.
    send(command, { complete: (appended) => appended && onClose() })
  }

  const choices = costChoices(stratagem?.cp ?? 0)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a missed action</DialogTitle>
          <DialogDescription>
            Book it against the phase it happened in. It is judged by that phase’s limits and command points, and the battle events mark it
            as recorded late.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {table.length > 1 ? (
            <Choice
              label="Side"
              value={sideIndex}
              columns={2}
              options={table.map((entry) => ({ value: String(entry.index), name: sideName(entry) }))}
              onChange={(value) => {
                setSideIndex(value)
                setStratagemKey(null)
                setCp(null)
                setScoreKey(PRIMARY)
              }}
            />
          ) : null}
          <Choice label="Missed action" value={action} columns={3} options={ACTIONS} onChange={setAction} />
          {action === 'stratagem' ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <div className="min-w-0">
                <Label className="eyebrow" htmlFor="missed-stratagem">
                  Stratagem
                </Label>
                <Select
                  value={stratagemKey}
                  onValueChange={(value) => {
                    setStratagemKey(value)
                    setCp(null)
                  }}
                >
                  <SelectTrigger id="missed-stratagem" className="mt-1.5 w-full">
                    <SelectValue>
                      {(value: unknown) => stratagems.find((candidate) => candidate.key === value)?.name ?? 'Choose a stratagem'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stratagems.map((candidate) => (
                      <SelectItem key={candidate.key} value={candidate.key} label={candidate.name} disabled={latestFitting(candidate) < 0}>
                        <span className="flex min-w-0 flex-col">
                          <span>
                            {candidate.name} · {candidate.cp} CP
                          </span>
                          <span className="text-2xs text-dim">{stratagemTiming(candidate).slice(0, 2).join(' · ')}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pb-1.5">
                <Stepper
                  label="command points"
                  count={stratagem ? cost : null}
                  countLabel={`${cost} CP`}
                  onRemove={stratagem && cost > choices[0]! ? () => setCp(cost - 1) : undefined}
                  onAdd={stratagem && cost < choices.at(-1)! ? () => setCp(cost + 1) : undefined}
                />
              </div>
            </div>
          ) : null}
          {action === 'score' ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <div className="min-w-0">
                <Label className="eyebrow" htmlFor="missed-mission">
                  Mission
                </Label>
                <Select value={scoreKey} onValueChange={(value) => value !== null && setScoreKey(value)}>
                  <SelectTrigger id="missed-mission" className="mt-1.5 w-full">
                    <SelectValue>
                      {(value: unknown) =>
                        value === PRIMARY ? 'Primary mission' : (cards.find((card) => card.key === value)?.name ?? 'Choose a mission')
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PRIMARY}>Primary mission</SelectItem>
                    {cards.map((card) => (
                      <SelectItem key={card.key} value={card.key}>
                        {card.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pb-1.5">
                <Stepper
                  label="victory points"
                  count={vp}
                  countLabel={`${vp} VP`}
                  onRemove={vp > 1 ? () => setVp(vp - 1) : undefined}
                  onAdd={() => setVp(vp + 1)}
                />
              </div>
            </div>
          ) : null}
          {action === 'cp' ? <p className="text-sm text-dim">Records the side’s 1 additional CP for that battle round.</p> : null}
          <fieldset className="space-y-2">
            <legend className="eyebrow">When it happened</legend>
            {stratagem ? <p className="text-xs text-dim">Only the phases {stratagem.name} can be used in are open.</p> : null}
            {turns.map((turn) => (
              <div key={`${turn.round}-${turn.turn}`} className="space-y-1">
                <p className="text-2xs font-bold tracking-widest text-dim uppercase">
                  Round {turn.round} · {turnName(turn)}
                </p>
                <div className="grid grid-cols-6 gap-1">
                  {PHASES.map((phase) => {
                    const index = moments.findIndex(
                      (candidate) => candidate.round === turn.round && candidate.turn === turn.turn && candidate.phase === phase,
                    )
                    const candidate = moments[index]
                    if (!candidate) return <span key={phase} aria-hidden className="h-8 rounded-sm border border-dashed border-edge/60" />
                    const chosen = index === momentAt
                    return (
                      <button
                        key={phase}
                        type="button"
                        aria-label={label(candidate)}
                        aria-pressed={chosen}
                        disabled={!fits(stratagem, candidate)}
                        onClick={() => setChosenMoment(index)}
                        className={`h-8 rounded-sm border text-2xs font-bold tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:border-edge/60 disabled:bg-transparent disabled:text-dim/50 ${
                          chosen
                            ? 'border-parchment bg-raised text-bone'
                            : 'border-edge bg-sunken text-dim hover:border-info hover:text-bone'
                        }`}
                      >
                        {PHASE_SHORT[phase]}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </fieldset>
          {summary && moment ? (
            <p className="rounded-sm border border-edge bg-sunken px-3 py-2 text-sm">
              <span className="font-bold text-bone">{summary}</span>
              <span className="text-dim"> · {label(moment)} phase</span>
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={pending || !command} onClick={record}>
            Record missed action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Each turn the moments cover, in the order they were played. */
function turnsOf(moments: readonly BattleMoment[]) {
  return moments.filter(
    (moment, index) => moments.findIndex((candidate) => candidate.round === moment.round && candidate.turn === moment.turn) === index,
  )
}
