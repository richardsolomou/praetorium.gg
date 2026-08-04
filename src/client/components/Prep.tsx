import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BattleView, Command, Secondary, Stratagem, StratagemLimit } from '../../core/battle'
import { ROSTER_NAME_MAX_LENGTH, SECONDARIES_MAX, STRATAGEM_CP_MAX, STRATAGEM_LIMITS, STRATAGEMS_MAX } from '../../core/battle'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean }

const LIMIT_WORDS: Record<StratagemLimit, string> = {
  phase: 'Once per phase',
  turn: 'Once per turn',
  battle: 'Once per battle',
  unlimited: 'Any number of times',
}

let counter = 0
const nextKey = () => `k${Date.now().toString(36)}${counter++}`

/** The select hands back an arbitrary string, so narrow it rather than assert it. */
const asLimit = (value: unknown): StratagemLimit => STRATAGEM_LIMITS.find((limit) => limit === value) ?? 'turn'

/**
 * Where a player writes down the stratagems and secondaries they are playing with.
 *
 * The community catalogue data carries neither — a detachment there has its rule
 * and its objective and nothing else — so the words come from the player's own
 * book. What the app does with them is the part worth having: the cost comes off
 * the right pool, and a once-per-turn stratagem cannot be used twice.
 */
export function Prep({ view, send, pending }: Props) {
  const you = view.players.find((player) => player.isViewer)
  const [stratagems, setStratagems] = useState<Stratagem[]>(
    () => you?.stratagems.map(({ key, name, cp, limit }) => ({ key, name, cp, limit })) ?? [],
  )
  const [secondaries, setSecondaries] = useState<Secondary[]>(() => you?.secondaries.map(({ key, name }) => ({ key, name })) ?? [])

  const change = (index: number, patch: Partial<Stratagem>) =>
    setStratagems((current) => current.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)))

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Your stratagems</Label>
          <Button
            variant="outline"
            size="sm"
            disabled={stratagems.length >= STRATAGEMS_MAX}
            onClick={() => setStratagems((current) => [...current, { key: nextKey(), name: '', cp: 1, limit: 'turn' }])}
          >
            <Plus />
            Add
          </Button>
        </div>
        {stratagems.length ? (
          <ul className="space-y-2">
            {stratagems.map((stratagem, index) => (
              <li key={stratagem.key} className="flex flex-wrap items-center gap-1.5">
                <Input
                  value={stratagem.name}
                  onChange={(event) => change(index, { name: event.target.value })}
                  maxLength={ROSTER_NAME_MAX_LENGTH}
                  placeholder="Grenade"
                  aria-label={`Stratagem ${index + 1} name`}
                  className="min-w-40 flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  max={STRATAGEM_CP_MAX}
                  value={stratagem.cp}
                  onChange={(event) => change(index, { cp: Number(event.target.value) })}
                  aria-label={`Stratagem ${index + 1} command points`}
                  className="readout w-16"
                />
                <Select value={stratagem.limit} onValueChange={(value: string | null) => change(index, { limit: asLimit(value) })}>
                  <SelectTrigger aria-label={`Stratagem ${index + 1} limit`} className="w-44">
                    <SelectValue>{(value: unknown) => LIMIT_WORDS[asLimit(value)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STRATAGEM_LIMITS.map((limit) => (
                      <SelectItem key={limit} value={limit}>
                        {LIMIT_WORDS[limit]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove stratagem ${index + 1}`}
                  onClick={() => setStratagems((current) => current.filter((_, at) => at !== index))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-dim">None yet. Copy the six from your detachment and they will be tracked for you.</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Your secondaries</Label>
          <Button
            variant="outline"
            size="sm"
            disabled={secondaries.length >= SECONDARIES_MAX}
            onClick={() => setSecondaries((current) => [...current, { key: nextKey(), name: '' }])}
          >
            <Plus />
            Add
          </Button>
        </div>
        {secondaries.length ? (
          <ul className="space-y-2">
            {secondaries.map((secondary, index) => (
              <li key={secondary.key} className="flex items-center gap-1.5">
                <Input
                  value={secondary.name}
                  onChange={(event) =>
                    setSecondaries((current) => current.map((entry, at) => (at === index ? { ...entry, name: event.target.value } : entry)))
                  }
                  maxLength={ROSTER_NAME_MAX_LENGTH}
                  placeholder="Behind Enemy Lines"
                  aria-label={`Secondary ${index + 1} name`}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove secondary ${index + 1}`}
                  onClick={() => setSecondaries((current) => current.filter((_, at) => at !== index))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-dim">Name them and each one is scored on its own, rather than into one pile.</p>
        )}
      </section>

      {/* One act, one command: two would make the second stale against the first. */}
      <Button
        variant="secondary"
        size="sm"
        disabled={
          pending || stratagems.some((stratagem) => !stratagem.name.trim()) || secondaries.some((secondary) => !secondary.name.trim())
        }
        onClick={() => send({ kind: 'set-prep', stratagems, secondaries })}
      >
        Save these
      </Button>
    </div>
  )
}
