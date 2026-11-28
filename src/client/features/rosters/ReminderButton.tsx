import { Bell, BellRing } from 'lucide-react'
import { useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ReminderSubject } from '../../../core/reminders'
import { DatasheetUnit } from '../../components/UnitFromVsData'

export type ReminderControls = {
  active: (subject: ReminderSubject) => boolean
  /** `owner` is the datasheet or detachment the subject's rule text is read through, as `DatasheetUnit` holds it. */
  onSelect: (subject: ReminderSubject, owner: string | null) => void
}

export function ReminderButton({ subject, controls }: { subject: ReminderSubject; controls: ReminderControls }) {
  const owner = useContext(DatasheetUnit)
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
            aria-label={label}
            onClick={() => controls.onSelect(subject, owner)}
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
