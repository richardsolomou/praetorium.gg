/** One option card. `count` and `detail` are both optional: some choices need neither. */
export type ChoiceOption<T extends string> = { value: T; name: string; count?: string; detail?: string }

/**
 * A small set of options laid out as cards, one of them pressed.
 *
 * By default the whole set sits across one row from `sm` and stacks below it, so a set
 * of three is never two cards and an orphan. `columns` fixes the grid at every width
 * instead, for cards short enough to sit across a phone.
 */
const COLUMNS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3' }
const WIDE_COLUMNS: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }

export function Choice<T extends string>({
  label,
  value,
  options,
  columns,
  disabled = false,
  onChange,
}: {
  label: string
  value: T
  options: ChoiceOption<T>[]
  columns?: 2 | 3
  disabled?: boolean
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="eyebrow">{label}</legend>
      <div className={`grid gap-2 ${columns ? COLUMNS[columns] : (WIDE_COLUMNS[options.length] ?? 'sm:grid-cols-2')}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${value === option.value ? 'border-parchment bg-raised' : 'border-edge bg-sunken hover:border-info'}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="block text-sm font-bold text-balance uppercase">{option.name}</span>
            {option.count ? <span className="block text-[0.625rem] text-dim uppercase">{option.count}</span> : null}
            {option.detail ? <span className="mt-1 block text-xs text-dim">{option.detail}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
