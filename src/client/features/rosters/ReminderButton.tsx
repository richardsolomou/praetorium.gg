import { Bell, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ReminderSubject } from '../../../core/reminders'

export type ReminderControls = {
  active: (subject: ReminderSubject) => boolean
  onSelect: (subject: ReminderSubject) => void
}

export function ReminderButton({ subject, controls }: { subject: ReminderSubject; controls: ReminderControls }) {
  const active = controls.active(subject)
  const label = `${active ? 'Edit' : 'Set'} alert for ${subject.name}`
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className={active ? 'text-parchment' : 'text-faint hover:text-bone'}
            data-onboarding="unit-reminder"
            aria-label={label}
            onClick={() => controls.onSelect(subject)}
          />
        }
      >
        {active ? <BellRing /> : <Bell />}
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
