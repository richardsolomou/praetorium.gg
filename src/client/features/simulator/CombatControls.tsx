import type { CombatPhase } from '../../../core/combat'
import { useState, type ReactElement, type ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { Toggle as ToggleButton } from '@/components/ui/toggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Crosshair, Swords } from 'lucide-react'

const selectClass = 'h-9 w-full min-w-0 rounded-lg border border-edge bg-sunken px-2 text-sm text-bone'

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

export function Chip({
  label,
  ariaLabel,
  checked,
  disabled,
  onChange,
  ineffectiveReason,
}: {
  label: string
  ariaLabel?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  ineffectiveReason?: string
}) {
  const control = (
    <ToggleButton
      variant="outline"
      size="sm"
      aria-label={ariaLabel}
      pressed={checked}
      disabled={disabled}
      onPressedChange={onChange}
      className={`${pressedClass} ${ineffectiveReason && !checked ? 'opacity-45 hover:opacity-70' : ''}`}
    >
      {label}
    </ToggleButton>
  )
  return <NoEffect reason={ineffectiveReason}>{control}</NoEffect>
}

/** Says why a control changes nothing, on hover, focus or tap, without taking the tap from the control. */
export function NoEffect({ reason, children }: { reason?: string; children: ReactElement }) {
  const [open, setOpen] = useState(false)
  return reason ? (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        closeOnClick={false}
        render={children}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      />
      <TooltipContent role="tooltip" side="bottom">
        No effect: {reason}
      </TooltipContent>
    </Tooltip>
  ) : (
    children
  )
}

export const PHASE_TITLES = { ranged: 'Shooting', melee: 'Melee' } as const

/** Lets a picker's list grow past a narrow trigger so unit and roster names stay readable. */
export const PICKER_POPUP = 'min-w-[min(20rem,var(--available-width))]'

export function PhaseIcon({ phase, className = 'size-3.5' }: { phase: CombatPhase; className?: string }) {
  const Icon = phase === 'ranged' ? Crosshair : Swords
  return <Icon className={cn(className, 'shrink-0 text-info')} aria-hidden />
}
