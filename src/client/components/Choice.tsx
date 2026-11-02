import type { OnboardingTarget } from '../onboardingTargets'

/** One option card. `count` and `detail` are both optional: some choices need neither. */
export type ChoiceOption<T extends string> = { value: T; name: string; count?: string; detail?: string }

const COLUMNS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' }
const WIDE_COLUMNS: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }

/**
 * A small set of options laid out as cards, one of them pressed.
 *
 * By default the whole set sits across one row from `sm` and stacks below it, so a set
 * of three is never two cards and an orphan. `columns` fixes the grid at every width
 * instead, for cards short enough to sit across a phone, or one per row for a narrow column.
 */
export function Choice<T extends string>({
  label,
  value,
  options,
  columns,
  disabled = false,
  onboarding,
  onChange,
}: {
  label: string
  value: T
  options: ChoiceOption<T>[]
  columns?: 1 | 2 | 3
  disabled?: boolean
  onboarding?: OnboardingTarget
  onChange: (value: T) => void
}) {
  return (
    <fieldset data-onboarding={onboarding} className="space-y-1.5" disabled={disabled}>
      <legend className="eyebrow">{label}</legend>
      <div className={`grid gap-2 ${columns ? COLUMNS[columns] : (WIDE_COLUMNS[options.length] ?? 'sm:grid-cols-2')}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`flex min-h-15 flex-col justify-start gap-0.5 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${value === option.value ? 'border-parchment bg-parchment/10 inset-ring-1 inset-ring-parchment' : 'border-runner bg-panel hover:border-runner-hi'}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="block text-[0.9375rem] font-bold text-balance text-bone">{option.name}</span>
            {option.count ? (
              <span className={`readout block text-xs font-semibold ${value === option.value ? 'text-parchment' : 'text-dim'}`}>
                {option.count}
              </span>
            ) : null}
            {option.detail ? <span className="block text-xs text-dim">{option.detail}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
