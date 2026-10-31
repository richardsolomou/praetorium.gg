import { Layers3 } from 'lucide-react'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { battleSizeName, detachmentPointBudget } from '../../../core/battle'
import { detachmentRefusal } from '../../components/rosterSetup'
import { matchesSearch } from '../../text'
import { PICKER_POPUP } from './CombatControls'

type Detachment = { id: string; name: string; points?: number | null; exclusiveWith?: readonly { id: string; limit: string }[] }

/** Several detachments, within the battle size's detachment and DP limits. */
export function DetachmentPicker({
  side,
  options,
  value,
  limit,
  disabled,
  onChange,
}: {
  side: string
  options: readonly Detachment[]
  value: readonly string[]
  limit: number
  disabled: boolean
  onChange: (ids: string[]) => void
}) {
  const selected = options.filter((option) => value.includes(option.id))
  const allowance = detachmentPointBudget(limit)
  const spent = selected.reduce((total, option) => total + (option.points ?? 0), 0)
  const refusals = new Map(
    options.flatMap((option) => {
      const refusal = value.includes(option.id) ? null : detachmentRefusal(option, selected, limit)
      return refusal ? [[option.id, refusal.reason] as const] : []
    }),
  )
  return (
    <Combobox<Detachment, true>
      multiple
      disabled={disabled}
      items={options}
      value={selected}
      onValueChange={(next) => onChange(next.filter((option) => !refusals.has(option.id)).map((option) => option.id))}
      itemToStringLabel={(option) => option.name}
      itemToStringValue={(option) => option.id}
      isItemEqualToValue={(option, candidate) => option.id === candidate.id}
      filter={(option, query) => matchesSearch(option.name, query)}
    >
      <ComboboxTrigger
        aria-label={`${side} detachments`}
        title={selected.length ? `Detachments: ${selected.map((option) => option.name).join(', ')}` : 'Choose detachments'}
        className={cn(
          'relative flex size-7 shrink-0 items-center justify-center rounded-lg border p-0 outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted [&>svg:last-child]:hidden',
          selected.length ? 'border-primary text-primary' : 'border-input text-dim',
        )}
      >
        <Layers3 className="size-4" aria-hidden />
        {selected.length > 1 ? (
          <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-primary text-[0.625rem] font-bold text-primary-foreground">
            {selected.length}
          </span>
        ) : null}
      </ComboboxTrigger>
      <ComboboxContent align="end" className={cn('w-80 max-w-[calc(100vw-2rem)] transition-none', PICKER_POPUP)}>
        <ComboboxInput placeholder="Search detachments…" showTrigger={false} />
        <p className="px-2.5 pt-2 pb-1 text-xs text-dim">
          {allowance === null
            ? battleSizeName(limit)
            : selected.length
              ? `${battleSizeName(limit)} · ${allowance - spent} of ${allowance} DP left`
              : `${battleSizeName(limit)} · ${allowance} DP across detachments`}
        </p>
        <ComboboxEmpty className="text-dim">No detachments match.</ComboboxEmpty>
        <ComboboxList>
          {(option: Detachment) => (
            <ComboboxItem
              key={option.id}
              value={option}
              disabled={refusals.has(option.id)}
              aria-label={[option.name, option.points == null ? null : `${option.points} DP`, refusals.get(option.id)]
                .filter(Boolean)
                .join(', ')}
              className="data-highlighted:bg-edge"
            >
              <span className="min-w-0">
                <span className="block truncate">{option.name}</span>
                {refusals.has(option.id) ? <span className="block text-xs text-dim">{refusals.get(option.id)}</span> : null}
              </span>
              {option.points == null ? null : <span className="ml-auto shrink-0 pl-3 text-xs text-dim">{option.points} DP</span>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
