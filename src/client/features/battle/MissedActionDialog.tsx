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
import { type BattleMoment, type Command, isNewOrders } from '../../../core/battle'
import { phaseName } from '../../../core/reminders'
import { type Side, sideName, sideOf } from '../../sides'
import type { SendCommand } from './useCommand'
import { Problem } from '../../components/Problem'

type Action = 'stratagem' | 'score' | 'cp'

const ACTIONS: { value: Action; name: string }[] = [
  { value: 'stratagem', name: 'Stratagem' },
  { value: 'score', name: 'Victory points' },
  { value: 'cp', name: 'CP gained' },
]

const PRIMARY = 'primary'

/**
 * Records an action the table forgot, against the earlier phase it belongs to.
 *
 * The domain judges it as of that phase and refuses what it cannot place safely, so
 * this offers the choices and reports the refusal rather than deciding legality.
 */
export function MissedActionDialog({
  moments,
  table,
  send,
  pending,
  problem,
  onClose,
}: {
  moments: readonly BattleMoment[]
  table: readonly Side[]
  send: SendCommand
  pending: boolean
  problem: string | null
  onClose: () => void
}) {
  const [sideIndex, setSideIndex] = useState(String((table.find((side) => side.isViewer) ?? table[0])?.index ?? 0))
  const [action, setAction] = useState<Action>('stratagem')
  const [momentAt, setMomentAt] = useState(moments.length - 1)
  const [stratagemKey, setStratagemKey] = useState<string | null>(null)
  const [scoreKey, setScoreKey] = useState(PRIMARY)
  const [vp, setVp] = useState(1)
  const [refused, setRefused] = useState(false)

  const side = table.find((candidate) => String(candidate.index) === sideIndex) ?? table[0]
  const moment = moments[momentAt]
  const stratagems = side?.stratagems.filter((stratagem) => !isNewOrders(stratagem)) ?? []
  const cards = side?.secondaries.filter((card) => card.status === 'active' && card.key !== 'secret') ?? []
  const label = (candidate: BattleMoment) => {
    const turn = sideOf(table, candidate.turn)
    return `Round ${candidate.round} · ${turn ? sideName(turn) : 'Unknown'}’s turn · ${phaseName(candidate.phase)}`
  }

  const command = ((): Command | null => {
    if (!side || !moment) return null
    const target = { playerId: side.captain.id, missed: moment }
    if (action === 'cp') return { kind: 'adjust-cp', delta: 1, ...target }
    if (action === 'stratagem') return stratagemKey ? { kind: 'use-stratagem', key: stratagemKey, ...target } : null
    return {
      kind: 'score-settlement',
      scores: [scoreKey === PRIMARY ? { category: 'primary', delta: vp } : { category: 'secondary', key: scoreKey, delta: vp }],
      ...target,
    }
  })()

  const record = () => {
    if (!command) return
    setRefused(false)
    send(command, { complete: (appended) => (appended ? onClose() : setRefused(true)) })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a missed action</DialogTitle>
          <DialogDescription>
            Record it in the phase it happened. It keeps that phase’s limits and command points, and the battle events mark it as recorded
            late.
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
                setScoreKey(PRIMARY)
              }}
            />
          ) : null}
          <Choice label="Missed action" value={action} columns={3} options={ACTIONS} onChange={setAction} />
          <div>
            <Label className="eyebrow" htmlFor="missed-moment">
              When it happened
            </Label>
            <Select value={momentAt} onValueChange={(value) => value !== null && setMomentAt(value)}>
              <SelectTrigger id="missed-moment" className="mt-1.5 w-full">
                <SelectValue>
                  {(value: unknown) => (typeof value === 'number' && moments[value] ? label(moments[value]) : 'Choose')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {moments.map((candidate, index) => (
                  <SelectItem key={`${candidate.round}-${candidate.turn}-${candidate.phase}`} value={index}>
                    {label(candidate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {action === 'stratagem' ? (
            <div>
              <Label className="eyebrow" htmlFor="missed-stratagem">
                Stratagem
              </Label>
              <Select value={stratagemKey} onValueChange={setStratagemKey}>
                <SelectTrigger id="missed-stratagem" className="mt-1.5 w-full">
                  <SelectValue>
                    {(value: unknown) => {
                      const chosen = stratagems.find((stratagem) => stratagem.key === value)
                      return chosen ? `${chosen.name} · ${chosen.cp} CP` : 'Choose a stratagem'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stratagems.map((stratagem) => (
                    <SelectItem key={stratagem.key} value={stratagem.key}>
                      {stratagem.name} · {stratagem.cp} CP
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          {refused && problem ? <Problem>{problem}</Problem> : null}
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
