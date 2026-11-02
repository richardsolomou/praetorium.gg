import { ChevronLeft, ChevronRight, Crosshair, Plus, RotateCcw, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ControlTooltip } from '../../components/ControlTooltip'
import { ModelCounter } from '../../components/ModelCounter'
import { UnitPicker } from '../../components/UnitPicker'
import { FactionMark } from '../../components/FactionMark'
import { combatantDatasheetQuery, factionIndexQuery } from '../../queries'
import type { BenchmarkTarget, CombatUnitIndex } from './benchmarks'

/** The benchmark set laid out as the units it fields, each opening its own size, order and removal. */
export function BenchmarkTargets({
  targets,
  index,
  customized,
  disabled,
  onChange,
  onReset,
}: {
  targets: readonly BenchmarkTarget[]
  index: CombatUnitIndex
  customized: boolean
  disabled: boolean
  onChange: (targets: BenchmarkTarget[]) => void
  onReset: () => void
}) {
  const factions = useQuery(factionIndexQuery())
  return (
    <section aria-label="Benchmark targets" className="flex flex-wrap items-center gap-1.5 rounded-lg border border-edge bg-sunken p-2">
      <Crosshair className="mx-1 size-4 shrink-0 text-info" aria-hidden />
      {targets.map((target, position) => {
        const label = `${target.name} #${position + 1} benchmark`
        const faction = factions.data?.factions.find((entry) => entry.id === target.catalogueId)
        const move = (by: number) => {
          const next = [...targets]
          next.splice(position + by, 0, ...next.splice(position, 1))
          onChange(next)
        }
        return (
          <Popover key={target.key}>
            <PopoverTrigger
              disabled={disabled}
              aria-label={`Edit ${label}`}
              className="flex h-8 max-w-full min-w-0 items-center gap-1.5 part px-2 text-sm hover:border-edge-strong hover:bg-raised focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 data-popup-open:border-edge-strong data-popup-open:bg-raised"
            >
              {faction ? <FactionMark faction={faction} size="sm" /> : null}
              <span className="truncate">{target.name}</span>
            </PopoverTrigger>
            <PopoverContent align="start" aria-label={label} className="w-64 gap-3 p-3">
              <div>
                <p className="text-sm font-semibold">{target.name}</p>
                <p className="text-xs text-faint">{index.find((book) => book.catalogueId === target.catalogueId)?.name}</p>
              </div>
              <BenchmarkModelCounter
                target={target}
                label={label}
                disabled={disabled}
                onChange={(models) => onChange(targets.map((entry, at) => (at === position ? { ...entry, models } : entry)))}
              />
              <div className="flex items-center gap-1 border-t border-edge pt-2">
                <ControlTooltip label="Earlier">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${label} earlier`}
                    disabled={disabled || position === 0}
                    onClick={() => move(-1)}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                </ControlTooltip>
                <ControlTooltip label="Later">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${label} later`}
                    disabled={disabled || position === targets.length - 1}
                    onClick={() => move(1)}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </ControlTooltip>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-dim"
                  aria-label={`Remove ${label}`}
                  disabled={disabled}
                  onClick={() => onChange(targets.filter((_, at) => at !== position))}
                >
                  <X aria-hidden /> Remove
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
      <UnitPicker
        ariaLabel="Add benchmark target"
        placeholder="Add unit"
        searchPlaceholder="Search units from any faction…"
        disabled={disabled || targets.length >= 50}
        index={index}
        align="start"
        trigger={
          <span className="flex items-center gap-1.5">
            <Plus className="size-4" aria-hidden /> Add unit
          </span>
        }
        className="h-8 w-auto border-dashed px-2.5 text-dim"
        onUnitChange={(catalogueId, entryId) => {
          const unit = index.find((book) => book.catalogueId === catalogueId)?.units.find((candidate) => candidate.id === entryId)
          if (unit) onChange([...targets, { key: crypto.randomUUID(), catalogueId, entryId, name: unit.name }])
        }}
      />
      {customized ? (
        <ControlTooltip label="Reset to starter set">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset to starter set"
            className="text-dim"
            disabled={disabled}
            onClick={onReset}
          >
            <RotateCcw aria-hidden />
          </Button>
        </ControlTooltip>
      ) : null}
    </section>
  )
}

function BenchmarkModelCounter({
  target,
  label,
  disabled,
  onChange,
}: {
  target: BenchmarkTarget
  label: string
  disabled: boolean
  onChange: (models: number) => void
}) {
  const defaults = useQuery(combatantDatasheetQuery(target.catalogueId, target.entryId, [], [{ entryId: target.entryId }], 0))
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-dim">Models</p>
      <ModelCounter
        count={target.models ?? defaults.data?.models ?? null}
        label={label}
        inputLabel={`${label} models`}
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
