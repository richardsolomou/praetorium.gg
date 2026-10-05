import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  REMINDER_PHASES,
  REMINDER_TIMINGS_MAX,
  REMINDER_TURNS,
  reminderTimingLabel,
  type ReminderMoment,
  type ReminderPhase,
  type ReminderTiming,
  type ReminderTurn,
  type RosterReminder,
} from '../../../core/reminders'
import { RuleText } from '../../components/RuleText'

const MOMENTS: { value: ReminderMoment; label: string }[] = [
  { value: 'phase-start', label: 'Start of phase' },
  { value: 'phase-end', label: 'End of phase' },
  { value: 'turn-start', label: 'Start of turn' },
  { value: 'turn-end', label: 'End of turn' },
  { value: 'round-start', label: 'Start of round' },
  { value: 'round-end', label: 'End of round' },
]

const TURN_LABELS: Record<ReminderTurn, string> = {
  'your-turn': 'Your turn',
  'opponent-turn': "Opponent's turn",
  either: 'Either turn',
}

const phaseLabel = (phase: ReminderPhase) => (phase === 'any' ? 'Any phase' : `${phase[0]?.toLocaleUpperCase()}${phase.slice(1)}`)

type TimingDraft = {
  id: string
  moment: ReminderMoment | null
  phase: ReminderPhase | null
  turn: ReminderTurn | null
  firstRoundOnly?: boolean
}

export type ReminderDraft = Omit<RosterReminder, 'timings'> & { timings: ReminderTiming[] }

const blankTiming = (id: string): TimingDraft => ({ id, moment: null, phase: null, turn: null })

const timingDrafts = (timings: readonly ReminderTiming[], id: string): TimingDraft[] =>
  timings.length ? timings.map((timing, index) => ({ id: `${id}-${index}`, ...timing })) : [blankTiming(`${id}-0`)]

const completeTiming = (draft: TimingDraft): ReminderTiming | null => {
  const restriction = draft.firstRoundOnly ? { firstRoundOnly: true } : {}
  if (draft.moment === 'round-start' || draft.moment === 'round-end')
    return { moment: draft.moment, phase: null, turn: 'either', ...restriction }
  if (!draft.moment || !draft.turn) return null
  if (draft.moment === 'turn-start' || draft.moment === 'turn-end')
    return { moment: draft.moment, phase: null, turn: draft.turn, ...restriction }
  return draft.phase ? { moment: draft.moment, phase: draft.phase, turn: draft.turn, ...restriction } : null
}

export function ReminderEditorDialog({
  draft,
  onClose,
  onSave,
  onRemove,
}: {
  draft: ReminderDraft
  onClose: () => void
  onSave: (reminder: RosterReminder) => void
  onRemove?: () => void
}) {
  const id = useId()
  const nextTimingId = useRef(draft.timings.length || 1)
  const [whileDestroyed, setWhileDestroyed] = useState(draft.whileDestroyed === true)
  const [timings, setTimings] = useState<TimingDraft[]>(() => timingDrafts(draft.timings, id))

  useEffect(() => {
    setWhileDestroyed(draft.whileDestroyed === true)
    nextTimingId.current = draft.timings.length || 1
    setTimings(timingDrafts(draft.timings, id))
  }, [draft, id])

  const completed = timings.map(completeTiming)
  const valid = completed.every((timing) => timing !== null)

  const updateTiming = (index: number, update: Partial<TimingDraft>) =>
    setTimings((current) => current.map((timing, at) => (at === index ? { ...timing, ...update } : timing)))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.ability}</DialogTitle>
          <DialogDescription>{draft.unit ? `${draft.unit.name} · ` : ''}Choose when this alert appears during a battle.</DialogDescription>
        </DialogHeader>

        {draft.description ? (
          <div className="max-h-40 overflow-y-auto border border-edge bg-sunken p-3 text-xs">
            <RuleText text={draft.description} rules={[]} />
          </div>
        ) : null}

        <div className="space-y-3">
          {timings.map((timing, index) => {
            const complete = completed[index]
            const roundTiming = timing.moment === 'round-start' || timing.moment === 'round-end'
            const prefix = `${id}-${index}`
            return (
              <div key={timing.id} className="border border-edge bg-card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="eyebrow">Trigger {index + 1}</p>
                  {timings.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove trigger ${index + 1}`}
                      onClick={() => setTimings((current) => current.filter((_, at) => at !== index))}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="eyebrow" htmlFor={`${prefix}-moment`}>
                      When
                    </Label>
                    <Select
                      value={timing.moment}
                      onValueChange={(value: ReminderMoment | null) =>
                        updateTiming(index, {
                          moment: value,
                          ...(value === 'turn-start' || value === 'turn-end' ? { phase: null } : {}),
                          ...(value === 'round-start' || value === 'round-end' ? { phase: null, turn: 'either' } : {}),
                        })
                      }
                    >
                      <SelectTrigger id={`${prefix}-moment`} className="mt-1.5 w-full">
                        <SelectValue>{(value: unknown) => MOMENTS.find((entry) => entry.value === value)?.label ?? 'Choose'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {MOMENTS.map((entry) => (
                          <SelectItem key={entry.value} value={entry.value}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="eyebrow" htmlFor={`${prefix}-phase`}>
                      Phase
                    </Label>
                    <Select
                      value={timing.phase}
                      disabled={roundTiming || timing.moment === 'turn-start' || timing.moment === 'turn-end'}
                      onValueChange={(value: ReminderPhase | null) => updateTiming(index, { phase: value })}
                    >
                      <SelectTrigger id={`${prefix}-phase`} className="mt-1.5 w-full">
                        <SelectValue>{(value: unknown) => (value ? phaseLabel(value as ReminderPhase) : 'Choose')}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {[...REMINDER_PHASES, 'any' as const].map((value) => (
                          <SelectItem key={value} value={value}>
                            {phaseLabel(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="eyebrow" htmlFor={`${prefix}-turn`}>
                      Whose turn
                    </Label>
                    <Select
                      disabled={roundTiming}
                      value={timing.turn}
                      onValueChange={(value: ReminderTurn | null) => updateTiming(index, { turn: value })}
                    >
                      <SelectTrigger id={`${prefix}-turn`} className="mt-1.5 w-full">
                        <SelectValue>{(value: unknown) => (value ? TURN_LABELS[value as ReminderTurn] : 'Choose')}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {REMINDER_TURNS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {TURN_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <label className="mt-2 flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={timing.firstRoundOnly === true}
                    onChange={(event) => updateTiming(index, { firstRoundOnly: event.target.checked })}
                  />
                  First round only
                </label>
                {complete ? <p className="mt-2 text-xs text-info">Alert: {reminderTimingLabel(complete)}</p> : null}
              </div>
            )
          })}
          {timings.length < REMINDER_TIMINGS_MAX ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const timingId = `${id}-${nextTimingId.current++}`
                setTimings((current) => [...current, blankTiming(timingId)])
              }}
            >
              <Plus /> Add trigger
            </Button>
          ) : null}
        </div>

        {draft.unit ? (
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={whileDestroyed}
              onChange={(event) => setWhileDestroyed(event.target.checked)}
            />
            Show while unit is destroyed
          </label>
        ) : null}

        <DialogFooter>
          {onRemove ? (
            <Button variant="destructive" onClick={onRemove} className="sm:mr-auto">
              Remove alert
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() =>
              valid &&
              onSave({
                ...draft,
                ...(draft.unit ? { whileDestroyed } : {}),
                timings: completed.filter((timing): timing is ReminderTiming => timing !== null),
              })
            }
          >
            Save alert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
