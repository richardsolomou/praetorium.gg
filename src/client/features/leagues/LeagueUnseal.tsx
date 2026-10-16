import { useMutation } from '@tanstack/react-query'
import { LockKeyholeOpen } from 'lucide-react'
import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { unsealLeagueRoster } from '../../functions'
import { errorMessage } from '../../queryClient'
import { useLeagueRefresh } from './leagueEvent'

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
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (unseal.isPending) return
          if (!open) unseal.reset()
          setConfirming(open)
        }}
      >
        <AlertDialogContent aria-busy={unseal.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Unseal {label}’s roster?</AlertDialogTitle>
            <AlertDialogDescription>
              Their revealed roster is discarded and they can seal another one for this event. Battles already started keep the roster they
              were created with.
            </AlertDialogDescription>
            {unseal.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(unseal.error)}
              </p>
            ) : null}
            {unseal.isPending ? <output className="sr-only">Unsealing roster…</output> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unseal.isPending}>Keep it sealed</AlertDialogCancel>
            <AlertDialogAction disabled={unseal.isPending} onClick={() => unseal.mutate()}>
              {unseal.isPending ? 'Unsealing…' : 'Unseal roster'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
