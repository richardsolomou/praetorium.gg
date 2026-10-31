import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { groupedReminders, type RosterReminder } from '../../../core/reminders'
import type { ReminderDismissalScope } from './reminderDismissals'
import { RuleText } from '../../components/RuleText'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'

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
  onDismiss: (reminders: readonly RosterReminder[], scope: ReminderDismissalScope) => void
  onDone: () => void
}) {
  const groups = groupedReminders(reminders)
  return (
    <BattlePromptDialog open minimizedLabel="Battle reminders">
      <BattleDialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="size-4 text-parchment" /> Battle {groups.length === 1 ? 'reminder' : 'reminders'}
          </DialogTitle>
          <DialogDescription>{moment}</DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-2">
          {groups.map(({ reminder, members, units }) => (
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
                        aria-label={`Hide ${reminder.ability} for a period`}
                      />
                    }
                  >
                    Hide for…
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onDismiss(members, 'phase')}>This phase</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDismiss(members, 'turn')}>This turn</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDismiss(members, 'round')}>This round</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDismiss(members, 'battle')}>This battle</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {units ? <p className="eyebrow mt-1">{units}</p> : null}
              {reminder.description ? (
                <div className="mt-2 text-xs">
                  <RuleText text={reminder.description} rules={[]} />
                </div>
              ) : null}
            </article>
          ))}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onDone}>{confirmLabel}</Button>
        </DialogFooter>
      </BattleDialogContent>
    </BattlePromptDialog>
  )
}
