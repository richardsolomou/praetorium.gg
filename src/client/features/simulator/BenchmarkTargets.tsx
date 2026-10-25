import { ChevronDown, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ModelCounter } from '../../components/ModelCounter'
import { UnitPicker } from '../../components/UnitPicker'
import { FactionMark } from '../../components/FactionMark'
import { combatantDatasheetQuery, factionIndexQuery } from '../../queries'
import { useState } from 'react'
import type { BenchmarkTarget, CombatUnitIndex } from './benchmarks'

export function BenchmarkTargets({
  targets,
  index,
  disabled,
  onChange,
  onReset,
}: {
  targets: readonly BenchmarkTarget[]
  index: CombatUnitIndex
  disabled: boolean
  onChange: (targets: BenchmarkTarget[]) => void
  onReset: () => void
}) {
  const factions = useQuery(factionIndexQuery())
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Benchmark targets" className="border border-edge bg-sunken">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary"
        >
          Benchmark targets · {targets.length}
          <ChevronDown className={`size-4 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h2>
      {open ? (
        <div className="space-y-3 border-t border-edge p-3">
          <p className="text-xs text-dim">
            Mix units from any faction. Targets start at their default squad size. This target set is saved in this browser.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {targets.map((target, position) => {
              const book = index.find((entry) => entry.catalogueId === target.catalogueId)
              const faction = factions.data?.factions.find((entry) => entry.id === target.catalogueId)
              return (
                <div key={target.key} className="flex min-w-0 items-center gap-2 border border-edge bg-panel p-2">
                  {faction ? <FactionMark faction={faction} size="sm" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{target.name}</p>
                    <p className="text-xs text-faint">{book?.name}</p>
                  </div>
                  <BenchmarkModelCounter
                    target={target}
                    position={position}
                    disabled={disabled}
                    onChange={(models) => onChange(targets.map((entry, at) => (at === position ? { ...entry, models } : entry)))}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${target.name} #${position + 1} benchmark`}
                    disabled={disabled}
                    onClick={() => onChange(targets.filter((_, at) => at !== position))}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
              )
            })}
          </div>
          <UnitPicker
            ariaLabel="Add benchmark target"
            value=""
            placeholder="Add a benchmark from any faction"
            searchPlaceholder="Search benchmark units…"
            disabled={disabled || targets.length >= 50}
            index={index}
            onValueChange={(value) => {
              const [catalogueId, entryId] = JSON.parse(value) as [string, string]
              const unit = index.find((book) => book.catalogueId === catalogueId)?.units.find((candidate) => candidate.id === entryId)
              if (unit) onChange([...targets, { key: crypto.randomUUID(), catalogueId, entryId, name: unit.name }])
            }}
          />
          <Button size="sm" variant="outline" disabled={disabled} onClick={onReset}>
            Reset benchmarks
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function BenchmarkModelCounter({
  target,
  position,
  disabled,
  onChange,
}: {
  target: BenchmarkTarget
  position: number
  disabled: boolean
  onChange: (models: number) => void
}) {
  const defaults = useQuery(combatantDatasheetQuery(target.catalogueId, target.entryId, [], [{ entryId: target.entryId }], 0))
  return (
    <div className="shrink-0 space-y-1">
      <p className="text-2xs text-dim">Models</p>
      <ModelCounter
        count={target.models ?? defaults.data?.models ?? null}
        label={`${target.name} #${position + 1} benchmark`}
        inputLabel={`${target.name} #${position + 1} benchmark models`}
        max={200}
        disabled={disabled}
        onChange={onChange}
      />
      {defaults.error ? (
        <Button size="sm" variant="outline" onClick={() => void defaults.refetch()}>
          Retry size
        </Button>
      ) : null}
    </div>
  )
}
