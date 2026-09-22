import type { ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const selectClass = 'h-9 w-full min-w-0 border border-edge bg-sunken px-2 text-sm text-bone'

export const rerolls = [
  ['none', 'None'],
  ['ones', 'Re-roll 1s'],
  ['failed', 'Re-roll failures'],
] as const
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
