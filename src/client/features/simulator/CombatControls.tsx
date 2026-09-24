import type { ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { Toggle as ToggleButton } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const selectClass = 'h-9 w-full min-w-0 border border-edge bg-sunken px-2 text-sm text-bone'

export function Choice<T extends string | number>({
  label,
  value,
  choices,
  onChange,
  ariaLabel,
  labelContent,
  disabled,
}: {
  label: string
  value: T
  choices: readonly (readonly [T, string])[]
  onChange: (value: T) => void
  ariaLabel?: string
  labelContent?: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="text-xs text-dim">
      {labelContent ?? label}
      <Select
        items={choices.map(([candidate, title]) => ({ value: candidate, label: title }))}
        value={value}
        disabled={disabled}
        onValueChange={(selected) => {
          const chosen = choices.find(([candidate]) => candidate === selected)
          if (chosen) onChange(chosen[0])
        }}
      >
        <SelectTrigger aria-label={ariaLabel ?? label} className={`${selectClass} mt-1`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map(([candidate, title]) => (
            <SelectItem key={candidate} value={candidate}>
              {title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function Toggle({
  label,
  ariaLabel,
  labelContent,
  checked,
  onChange,
}: {
  label: string
  ariaLabel?: string
  labelContent?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const content = (
    <>
      <Switch aria-label={ariaLabel ?? label} className="mt-0.5" checked={checked} onCheckedChange={onChange} />
      {labelContent ?? <span aria-hidden>{label}</span>}
    </>
  )
  return labelContent ? (
    <div className="flex items-start gap-2">{content}</div>
  ) : (
    <label className="flex items-start gap-2">{content}</label>
  )
}

const pressedClass =
  'h-auto min-h-8 border-edge bg-sunken px-2 py-1 text-xs whitespace-normal text-dim hover:text-bone aria-pressed:border-primary aria-pressed:bg-primary/15 aria-pressed:text-primary'

/** Every option stays on screen, so the current value never hides behind a menu. */
export function Segmented<T extends string | number>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  value: T
  choices: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[String(value)]}
      onValueChange={(selected) => {
        const chosen = choices.find(([candidate]) => String(candidate) === selected[0])
        if (chosen) onChange(chosen[0])
      }}
      variant="outline"
      size="sm"
      spacing={0}
      className="w-full"
    >
      {choices.map(([candidate, title]) => (
        <ToggleGroupItem key={candidate} value={String(candidate)} className={`min-w-0 flex-1 ${pressedClass}`}>
          {title}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function Chip({
  label,
  ariaLabel,
  checked,
  disabled,
  onChange,
}: {
  label: string
  ariaLabel?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <ToggleButton
      variant="outline"
      size="sm"
      aria-label={ariaLabel}
      pressed={checked}
      disabled={disabled}
      onPressedChange={onChange}
      className={pressedClass}
    >
      {label}
    </ToggleButton>
  )
}
