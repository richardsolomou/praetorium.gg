import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { errorMessage } from '../../queryClient'
import { LeagueEventRuleFields, type LeagueEventRuleValue } from './LeagueEventRuleFields'

type Props = {
  open: boolean
  title: string
  description: string
  value: LeagueEventRuleValue
  blocked: boolean
  pending: boolean
  error: unknown
  action: string
  pendingAction: string
  onOpenChange: (open: boolean) => void
  onChange: (value: LeagueEventRuleValue) => void
  onSubmit: () => void
}

export function LeagueEventRuleDialog({
  open,
  title,
  description,
  value,
  blocked,
  pending,
  error,
  action,
  pendingAction,
  onOpenChange,
  onChange,
  onSubmit,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent aria-busy={pending} className="rounded-none border border-edge bg-panel text-bone">
        <AlertDialogHeader>
          <AlertDialogTitle className="uppercase">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-dim">{description}</AlertDialogDescription>
          <LeagueEventRuleFields value={value} disabled={pending} onChange={onChange} />
          {blocked ? (
            <p className="text-sm text-parchment">
              {value.format === '2v2'
                ? 'Raise the player limit to an even number of at least 4 in Edit league first.'
                : 'Raise the player limit to at least 3 in Edit league first.'}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{errorMessage(error)}</p> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending || blocked} onClick={onSubmit}>
            {pending ? pendingAction : action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
