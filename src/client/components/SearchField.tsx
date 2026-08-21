import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  /**
   * What the cross is called.
   *
   * Not derived from `label`: a name that contains the field's own would make both
   * controls answer to a search for the field, and every test and screen reader
   * looking for the box would find two.
   */
  clearLabel: string
  className?: string
  inputClassName?: string
}

/**
 * A filter box with a way out of it.
 *
 * Every list in the app narrows by name, and a query that matches nothing looks
 * exactly like an empty shelf — so getting back to the whole list is worth a
 * control rather than a selection and a delete. Escape does the same for a
 * keyboard, and the cross is only there while there is something to clear.
 */
export function SearchField({ value, onChange, placeholder, label, clearLabel, className, inputClassName }: Props) {
  return (
    <div className={cn('relative', className)}>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) onChange('')
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(value && 'pr-8', inputClassName)}
      />
      {value ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-faint hover:text-bone"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
