import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { RosterReminder } from '../../../core/reminders'
import type { ReminderDismissalScope } from './reminderDismissals'
import { RuleText } from '../../components/RuleText'
import { BattlePromptDialog } from './BattlePromptDialog'

export function ReminderDialog({
  reminders,
  moment,
  confirmLabel,
  onDismiss,
  onDone,
}: {
  reminders: readonly RosterReminder[]
  moment: string
  confirmLabel: string
  onDismiss: (reminder: RosterReminder, scope: ReminderDismissalScope) => void
  onDone: () => void
}) {
  return (
    <BattlePromptDialog open>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="size-4 text-parchment" /> Battle {reminders.length === 1 ? 'reminder' : 'reminders'}
          </DialogTitle>
          <DialogDescription>{moment}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
          {reminders.map((reminder) => (
            <article key={reminder.key} className="border border-edge bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-bone">{reminder.ability}</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        aria-label={`Dismiss ${reminder.ability} for a period`}
                      />
                    }
                  >
                    Dismiss…
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onDismiss(reminder, 'phase')}>This phase</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDismiss(reminder, 'turn')}>This turn</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDismiss(reminder, 'round')}>This round</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDismiss(reminder, 'battle')}>This battle</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {reminder.unit ? <p className="eyebrow mt-1">{reminder.unit.name}</p> : null}
              {reminder.description ? (
                <div className="mt-2 text-xs">
                  <RuleText text={reminder.description} rules={[]} />
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={onDone}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </BattlePromptDialog>
  )
}
