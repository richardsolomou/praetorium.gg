import { Choice } from './Choice'

/** Each side's time for the whole battle; a tournament round usually gives each side half of it. */
const LIMITS = [60, 75, 90, 105, 120].map((minutes) => ({ value: String(minutes), name: `${minutes} min`, detail: 'Each side' }))

export const clockLimitLabel = (minutes: number) => `${minutes} min each side`

/** The chess clock's time per side; `none` names the choice without a limit, which means no clock at a table and a free choice in an event. */
export function ClockLimitChoice({
  value,
  none,
  disabled,
  onChange,
}: {
  value: number | null
  none: { name: string; detail: string }
  disabled: boolean
  onChange: (minutes: number | null) => void
}) {
  return (
    <Choice
      label="Chess clock"
      value={String(value ?? 0)}
      options={[{ value: '0', ...none }, ...LIMITS]}
      columns={3}
      disabled={disabled}
      onChange={(minutes) => onChange(Number(minutes) || null)}
    />
  )
}
