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

export function DrawUndoAlert({
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="uppercase">Undo mission draw?</AlertDialogTitle>
          <AlertDialogDescription className="text-dim">
            This returns drawn secondary missions to the deck. Any replacement draw will be random.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="rounded-none border-edge bg-sunken">
          <AlertDialogCancel>Keep missions</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
            Undo draw
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
