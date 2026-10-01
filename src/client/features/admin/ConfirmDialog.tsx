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
import { Problem } from './feedback'

/** The one question asked before an administrator changes someone else's account or data. */
export function ConfirmDialog({
  title,
  description,
  cancel,
  confirm,
  pendingLabel,
  destructive = false,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  title: string
  description: string
  cancel: string
  confirm: string
  pendingLabel: string
  destructive?: boolean
  pending: boolean
  error: Error | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent aria-busy={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Problem error={error} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancel}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} disabled={pending} onClick={onConfirm}>
            {pending ? pendingLabel : confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
