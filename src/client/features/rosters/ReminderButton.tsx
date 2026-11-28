import { Bell, BellRing } from 'lucide-react'
import { type ReactNode, useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ReminderSubject } from '../../../core/reminders'
import { DatasheetUnit } from '../../components/UnitFromVsData'

export type ReminderControls = {
  active: (subject: ReminderSubject) => boolean
  /** `rule` is the subject's text as the page beside the button draws it, read through the same datasheet or detachment. */
  onSelect: (subject: ReminderSubject, rule: ReactNode) => void
}

export function ReminderButton({ subject, controls, rule }: { subject: ReminderSubject; controls: ReminderControls; rule: ReactNode }) {
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
            onClick={() => controls.onSelect(subject, <DatasheetUnit.Provider value={owner}>{rule}</DatasheetUnit.Provider>)}
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
