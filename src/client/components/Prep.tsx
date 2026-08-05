import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { BattleView, Command, Secondary, SecondaryMode, Stratagem } from '../../core/battle'
import { SECONDARIES_MAX, SECONDARY_MODES, STRATAGEMS_MAX } from '../../core/battle'
import { detachmentRulesQuery } from '../queries'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean }

/**
 * Choosing what you are playing with: stratagems, a primary mission, secondaries.
 *
 * Everything here is picked, never typed. The community catalogues carry none of
 * it, so it comes from the Tabletop Developer Consortium's dataset — which is also
 * why the attribution is on screen: its licence asks for it.
 */
export function Prep({ view, send, pending }: Props) {
  const you = view.players.find((player) => player.isViewer)
  const built = you?.roster?.built
  const detachmentNames = built?.detachments?.map((detachment) => detachment.name) ?? (built?.detachment ? [built.detachment] : [])
  const { data: rules } = useQuery(detachmentRulesQuery(built?.catalogueId ?? '', detachmentNames))

  const [stratagems, setStratagems] = useState<Stratagem[]>(
    () => you?.stratagems.map(({ key, name, cp, limit }) => ({ key, name, cp, limit })) ?? [],
  )
  const [secondaries, setSecondaries] = useState<Secondary[]>(() => you?.secondaries.map(({ key, name }) => ({ key, name })) ?? [])
  const [primary, setPrimary] = useState<Secondary | null>(() => you?.primaryCard ?? null)
  const [mode, setMode] = useState<SecondaryMode>(() => you?.secondaryMode ?? 'fixed')

  // A detachment's own stratagems are the answer often enough to be the default;
  // nothing is overwritten once the player has a set of their own.
  useEffect(() => {
    if (!rules?.stratagems.length) return
    setStratagems((current) => (current.length ? current : rules.stratagems))
  }, [rules])

  if (!rules) {
    return (
      <p className="text-sm text-dim">
        No stratagem or mission data on this instance. Run <span className="readout">pnpm catalogue:sync</span> and reload.
      </p>
    )
  }

  const offered = [...rules.stratagems, ...rules.core]

  return (
    <div className="space-y-5">
      <Pills
        label="Stratagems"
        entries={offered.map((stratagem) => ({ key: stratagem.key, name: stratagem.name, note: String(stratagem.cp) }))}
        taken={stratagems.map((stratagem) => stratagem.key)}
        onToggle={(key) => {
          const found = offered.find((stratagem) => stratagem.key === key)
          if (found) setStratagems((current) => toggle(current, found, STRATAGEMS_MAX))
        }}
      />

      <Pills
        label="Primary mission"
        entries={rules.primaries.map((card) => ({ key: card.key, name: card.name }))}
        taken={primary ? [primary.key] : []}
        onToggle={(key) => {
          const found = rules.primaries.find((card) => card.key === key)
          setPrimary((current) => (current?.key === key || !found ? null : { key: found.key, name: found.name }))
        }}
      />

      <section className="space-y-2">
        <Label>Secondary play</Label>
        <div className="flex gap-1.5">
          {SECONDARY_MODES.map((entry) => (
            <Button
              key={entry}
              variant={mode === entry ? 'default' : 'outline'}
              size="sm"
              aria-pressed={mode === entry}
              onClick={() => setMode(entry)}
            >
              {entry === 'fixed' ? 'Fixed' : 'Tactical'}
            </Button>
          ))}
        </div>
      </section>

      <Pills
        label="Secondaries"
        entries={rules.secondaries.map((card) => ({ key: card.key, name: card.name }))}
        taken={secondaries.map((secondary) => secondary.key)}
        onToggle={(key) => {
          const found = rules.secondaries.find((card) => card.key === key)
          if (found) setSecondaries((current) => toggle(current, { key: found.key, name: found.name }, SECONDARIES_MAX))
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        {/* One act, one command: two would make the second stale against the first. */}
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => send({ kind: 'set-prep', stratagems, secondaries, primary, secondaryMode: mode })}
        >
          Save these
        </Button>
        <p className="text-[0.6875rem] text-dim">
          {rules.attribution}
          {rules.dataslate ? ` · ${rules.dataslate.replaceAll('-', ' ')}` : ''}
        </p>
      </div>
    </div>
  )
}

/** In or out, up to a limit. */
function toggle<T extends { key: string }>(current: T[], entry: T, max: number): T[] {
  return current.some((held) => held.key === entry.key)
    ? current.filter((held) => held.key !== entry.key)
    : [...current, entry].slice(0, max)
}

type PillsProps = {
  label: string
  entries: { key: string; name: string; note?: string }[]
  taken: string[]
  onToggle: (key: string) => void
}

function Pills({ label, entries, taken, onToggle }: PillsProps) {
  if (!entries.length) return null
  return (
    <section className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {entries.map((entry) => {
          const chosen = taken.includes(entry.key)
          return (
            <Button
              key={entry.key}
              variant={chosen ? 'default' : 'outline'}
              size="sm"
              aria-pressed={chosen}
              onClick={() => onToggle(entry.key)}
            >
              {entry.name}
              {entry.note ? <span className="readout ml-1 text-xs opacity-70">{entry.note}</span> : null}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
