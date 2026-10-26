import { useMutation } from '@tanstack/react-query'
import { LogOut, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { dropLeagueEntrant } from '../../functions'
import { useLeagueRefresh } from './leagueEvent'
import { ConfirmDialog } from '../../components/ConfirmDialog'

/** Takes a player out of every later Swiss round: the viewer withdrawing, or an organizer dropping a no-show. */
export function DropEntrant({
  token,
  eventToken,
  userId,
  label,
  self,
}: {
  token: string
  eventToken: string
  userId: string
  label: string
  self: boolean
}) {
  const refresh = useLeagueRefresh(token)
  const [confirming, setConfirming] = useState(false)
  const drop = useMutation({
    mutationFn: () => dropLeagueEntrant({ data: { token, eventToken, userId } }),
    onSuccess: async () => {
      setConfirming(false)
      await refresh()
    },
  })
  const action = self ? 'Withdraw' : 'Drop player'
  const [them, their] = self ? ['You', 'your'] : ['They', 'their']
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-dim hover:text-side-a pointer-coarse:size-11"
              aria-label={self ? 'Withdraw from the tournament' : `Drop ${label}`}
              disabled={drop.isPending}
              onClick={() => {
                drop.reset()
                setConfirming(true)
              }}
            />
          }
        >
          {self ? <LogOut aria-hidden /> : <UserMinus aria-hidden />}
        </TooltipTrigger>
        <TooltipContent role="tooltip" side="bottom">
          {action}
        </TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirming}
        title={self ? 'Withdraw from the tournament?' : `Drop ${label}?`}
        description={`${them} won’t be paired again and can’t rejoin, and ${their} results so far stay in the table. If ${their} table this round hasn’t finished, the opponent takes it as a bye; a battle already started there stays but no longer counts.`}
        cancel={self ? 'Stay in' : 'Keep them in'}
        confirm={action}
        pendingLabel={self ? 'Withdrawing…' : 'Dropping…'}
        destructive
        pending={drop.isPending}
        error={drop.error}
        onClose={() => {
          drop.reset()
          setConfirming(false)
        }}
        onConfirm={() => drop.mutate()}
      />
    </>
  )
}
