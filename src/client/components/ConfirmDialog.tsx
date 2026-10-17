import type { ReactNode } from 'react'
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
import { Problem } from './Problem'

/** One question asked before an action, which stays open while the action is pending and shows why it failed. */
export function ConfirmDialog({
  open = true,
  title,
  description,
  children,
  cancel,
  confirm,
  pendingLabel,
  destructive = false,
  pending = false,
  error = null,
  onClose,
  onConfirm,
}: {
  open?: boolean
  title: string
  description: ReactNode
  children?: ReactNode
  cancel: string
  confirm: string
  pendingLabel?: string
  destructive?: boolean
  pending?: boolean
  error?: Error | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent aria-busy={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error ? <Problem error={error} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancel}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} disabled={pending} onClick={onConfirm}>
            {pending ? (pendingLabel ?? confirm) : confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
