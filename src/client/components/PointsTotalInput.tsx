import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A battle size's own points total, typed beside the size it plays under. Empty plays the size's full points, which the
 * placeholder shows, so the size needs no separate custom entry.
 */
export function PointsTotalInput({
  id,
  limit,
  value,
  error,
  disabled,
  className,
  onChange,
}: {
  id: string
  limit: number
  value: string
  error: string | null
  disabled?: boolean
  className?: string
  onChange: (text: string) => void
}) {
  return (
    <Input
      id={id}
      aria-label="Points limit"
      inputMode="numeric"
      autoComplete="off"
      placeholder={String(limit)}
      value={value}
      disabled={disabled}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn('h-11 w-28 shrink-0 text-base', className)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** The problem with a typed points total, shown under its row; the box beside the size names what it is for. */
export function PointsTotalError({ id, error }: { id: string; error: string | null }) {
  if (!error) return null
  return (
    <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-destructive">
      {error}
    </p>
  )
}
