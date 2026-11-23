import { BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { groupedReminders, type RosterReminder } from '../../../core/reminders'
import type { ReminderDismissalScope } from './reminderDismissals'
import { RuleText } from '../../components/RuleText'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { DropdownMenuItem } from '../../components/Menu'

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
            <article key={reminder.key} className="part p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-bone">{reminder.ability}</h3>
                {groups.length > 1 ? <HideFor ability={reminder.ability} onHide={(scope) => onDismiss(members, scope)} /> : null}
              </div>
              {units ? <p className="eyebrow mt-1">{units}</p> : null}
              {reminder.description ? <ReminderText text={reminder.description} /> : null}
            </article>
          ))}
        </DialogBody>

        {/* One reminder's Hide for… sits beside the button that closes it, both under the thumb. */}
        <DialogFooter className="flex-row justify-end gap-2">
          {groups.length === 1 ? (
            <HideFor ability={groups[0]!.reminder.ability} onHide={(scope) => onDismiss(groups[0]!.members, scope)} footer />
          ) : null}
          <Button onClick={onDone}>{confirmLabel}</Button>
        </DialogFooter>
      </BattleDialogContent>
    </BattlePromptDialog>
  )
}

/** An alert's rule shows as its summary, or not at all. */
function ReminderText({ text }: { text: string }) {
  return (
    <div className="mt-2 text-xs">
      <RuleText text={text} rules={[]} />
    </div>
  )
}

function HideFor({
  ability,
  onHide,
  footer = false,
}: {
  ability: string
  onHide: (scope: ReminderDismissalScope) => void
  footer?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size={footer ? 'default' : 'sm'}
            className={footer ? undefined : 'h-7 shrink-0 px-2 text-xs'}
            aria-label={`Hide ${ability} for a period`}
          />
        }
      >
        Hide for…
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => onHide('phase')}>This phase</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onHide('turn')}>This turn</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onHide('round')}>This round</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onHide('battle')}>This battle</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
