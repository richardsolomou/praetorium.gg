import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { battlesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { deleteBattle } from '../../../server/functions'
import type { Battle } from './battle'

/**
 * The one question asked before a battle is deleted, wherever a shelf offers it.
 *
 * Every shelf that lets its owner delete opens this, so the warning and what the
 * confirmation actually does are written once.
 */
export function DeleteBattleDialog({ battle, onClose }: { battle: Battle | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (token: string) => deleteBattle({ data: { token } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      onClose()
    },
  })
  return (
    <AlertDialog
      open={Boolean(battle)}
      onOpenChange={(open) => {
        if (remove.isPending || open) return
        remove.reset()
        onClose()
      }}
    >
      <AlertDialogContent aria-busy={remove.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete battle?</AlertDialogTitle>
          <AlertDialogDescription>The score and everything that happened in it go too, for good.</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(remove.error)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Keep battle</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={() => battle && remove.mutate(battle.token)}>
            {remove.isPending ? 'Deleting…' : 'Delete battle'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
