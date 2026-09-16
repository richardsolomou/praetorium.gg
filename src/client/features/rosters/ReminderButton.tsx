import { Bell, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReminderSubject } from '../../../core/reminders'

export type ReminderControls = {
  active: (subject: ReminderSubject) => boolean
  onSelect: (subject: ReminderSubject, unitName: string) => void
  onRemove: (subject: ReminderSubject) => void
}

export function ReminderButton({
  subject,
  unitName,
  controls,
}: {
  subject: ReminderSubject
  unitName: string
  controls: ReminderControls
}) {
  const active = controls.active(subject)
  const label = `${active ? 'Edit' : 'Set'} alert for ${subject.name}`
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={active ? 'text-parchment' : 'text-faint hover:text-bone'}
      aria-label={label}
      title={label}
      onClick={() => controls.onSelect(subject, unitName)}
    >
      {active ? <BellRing /> : <Bell />}
    </Button>
  )
}
