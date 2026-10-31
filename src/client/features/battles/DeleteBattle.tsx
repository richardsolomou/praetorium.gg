import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { forgetBattle } from '../../queries'
import { deleteBattle } from '../../functions'
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
    onSuccess: (_, token) => {
      forgetBattle(queryClient, token)
      onClose()
    },
  })
  return (
    <ConfirmDialog
      open={Boolean(battle)}
      title="Delete battle?"
      description="The score and everything that happened in it go too, for good."
      cancel="Keep battle"
      confirm="Delete battle"
      pendingLabel="Deleting…"
      destructive
      pending={remove.isPending}
      error={remove.error}
      onClose={() => {
        remove.reset()
        onClose()
      }}
      onConfirm={() => battle && remove.mutate(battle.token)}
    />
  )
}
