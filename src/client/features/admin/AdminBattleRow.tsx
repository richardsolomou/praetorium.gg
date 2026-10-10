import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AdminBattle } from '../../../admin'
import { deleteBattleAsAdmin } from '../../functions'
import { battleStage } from '../../battleStage'
import { useDateFormatting } from '../../dates'
import { refreshAdminQueries } from '../../queries'
import { SettingRow } from '../../components/SettingRow'
import { ConfirmDialog } from './ConfirmDialog'

/** One battle as administration sees it: who sat where and how far it got, with a way to delete it. */
export function AdminBattleRow({ battle }: { battle: AdminBattle }) {
  const queryClient = useQueryClient()
  const dates = useDateFormatting()
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation({
    mutationFn: () => deleteBattleAsAdmin({ data: { battle: battle.token } }),
    onSuccess: async () => {
      setConfirming(false)
      await refreshAdminQueries(queryClient)
    },
  })
  const stage = battleStage(battle.status)
  const sides = [...new Set(battle.players.map((player) => player.side))].map((side) =>
    battle.players
      .filter((player) => player.side === side)
      .map((player) => player.name)
      .join(' & '),
  )
  const title = sides.join(' vs ')
  return (
    <>
      <SettingRow
        icon={<Swords className={`size-4 ${stage.tint}`} aria-hidden />}
        title={
          <Link to="/battles/$token" params={{ token: battle.token }} className="hover:text-info">
            {title}
          </Link>
        }
        detail={[
          battle.status === 'playing' ? `${stage.name} · round ${battle.round}` : stage.name,
          `started ${dates.date(battle.createdAt)}`,
          `last move ${dates.date(battle.lastActivity)}`,
        ].join(' · ')}
        action={
          <Button type="button" variant="ghost" size="sm" className="text-dim hover:text-destructive" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        }
      />
      {confirming ? (
        <ConfirmDialog
          title="Delete battle?"
          description={`${title} goes for every player in it, with its score and everything that happened. This cannot be undone.`}
          cancel="Keep battle"
          confirm="Delete battle"
          pendingLabel="Deleting…"
          destructive
          pending={remove.isPending}
          error={remove.error}
          onClose={() => setConfirming(false)}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </>
  )
}
