import { useMutation } from '@tanstack/react-query'
import { LockKeyholeOpen } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { unsealLeagueRoster } from '../../functions'
import { useLeagueRefresh } from './leagueEvent'
import { ConfirmDialog } from '../../components/ConfirmDialog'

/** An organizer's way to send one revealed roster back to its player, behind a confirmation that says what it costs. */
export function UnsealRoster({ token, eventToken, userId, label }: { token: string; eventToken: string; userId: string; label: string }) {
  const refresh = useLeagueRefresh(token)
  const [confirming, setConfirming] = useState(false)
  const unseal = useMutation({
    mutationFn: () => unsealLeagueRoster({ data: { token, eventToken, userId } }),
    onSuccess: async () => {
      setConfirming(false)
      await refresh()
    },
  })
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-dim hover:text-discarded pointer-coarse:size-11"
              aria-label={`Unseal ${label}’s roster`}
              disabled={unseal.isPending}
              onClick={() => {
                unseal.reset()
                setConfirming(true)
              }}
            />
          }
        >
          <LockKeyholeOpen aria-hidden />
        </TooltipTrigger>
        <TooltipContent role="tooltip" side="bottom">
          Unseal roster
        </TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirming}
        title={`Unseal ${label}’s roster?`}
        description="Their revealed roster is discarded and they can seal another one for this event. Battles already started keep the roster they were created with."
        cancel="Keep it sealed"
        confirm="Unseal roster"
        pendingLabel="Unsealing…"
        pending={unseal.isPending}
        error={unseal.error}
        onClose={() => {
          unseal.reset()
          setConfirming(false)
        }}
        onConfirm={() => unseal.mutate()}
      >
        {unseal.isPending ? <output className="sr-only">Unsealing roster…</output> : null}
      </ConfirmDialog>
    </>
  )
}
