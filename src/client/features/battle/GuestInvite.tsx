import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { useQrCode } from '../../components/useQrCode'
import { guestInvite } from '../../functions'
import { battleQuery, guestInviteQuery } from '../../queries'

import { useNativeShare } from '../../nativeBridge'
import { useOrigin } from '../../useOrigin'
import { useShareLink } from '../../useShareLink'

/**
 * The link and QR code a host shows a guest so they play their own side on their own device.
 *
 * Until someone opens it the host plays the guest's side; taking the seat back retires the link and that device.
 */
export function GuestInvite({ token, playerId, name, joined }: { token: string; playerId: string; name: string; joined: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" aria-label={`Invite ${name} to play on their device`} onClick={() => setOpen(true)}>
        <QrCode /> {joined ? 'Their device' : 'Invite to play'}
      </Button>
      {open ? <GuestInviteDialog token={token} playerId={playerId} name={name} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function GuestInviteDialog({ token, playerId, name, onClose }: { token: string; playerId: string; name: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const origin = useOrigin()
  const nativeShare = useNativeShare()
  const invite = useQuery(guestInviteQuery(token, playerId))
  const [confirming, setConfirming] = useState(false)
  const link = useShareLink('guest_invite_shared')
  const joined = invite.data?.joined ?? false
  const url = invite.data && origin ? `${origin}/join/${invite.data.invite}` : null
  const { image, failed } = useQrCode(joined ? null : url, 224)
  // The battle screen learns who plays the seat only when it is read again.
  useEffect(() => {
    if (joined) void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
  }, [joined, queryClient, token])
  const replace = useMutation({
    mutationFn: () => guestInvite({ data: { token, playerId, replace: true } }),
    onSuccess: async (renewed) => {
      queryClient.setQueryData(guestInviteQuery(token, playerId).queryKey, renewed)
      setConfirming(false)
      link.reset()
      posthog.capture('guest_seat_taken_back')
      await queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
    },
  })
  const share = () => (url ? link.share(url, `Play ${name}’s side on Praetorium`) : undefined)
  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent size="sm" fit>
          <DialogHeader>
            <DialogTitle>{joined ? `${name} is playing on their device` : `Invite ${name} to play`}</DialogTitle>
            <DialogDescription>
              {joined
                ? 'They choose their own army and play their side. Take the seat back if they lose their device or leave.'
                : 'They scan this code or open the link to choose their own army and play their side, without an account. Until then, you play their side.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {invite.error ? (
              <Problem error={invite.error} />
            ) : joined ? (
              <Button variant="outline" className="w-full" onClick={() => setConfirming(true)}>
                Take back {name}’s seat
              </Button>
            ) : url ? (
              <div className="space-y-3">
                {failed ? (
                  <Problem>Could not make a QR code. Share the link instead.</Problem>
                ) : image ? (
                  <img src={image} alt={`QR code for ${name}’s seat`} className="mx-auto size-56 bg-white" />
                ) : (
                  <output className="block text-sm text-dim">Preparing the code…</output>
                )}
                <p className="break-all text-xs text-dim">{url}</p>
                <Button className="w-full" onClick={() => void share()}>
                  {link.shared ? (link.shared === 'copied' ? 'Link copied' : 'Link shared') : nativeShare ? 'Share link' : 'Copy link'}
                </Button>
                {link.problem ? <Problem error={link.problem} /> : null}
                <p className="text-xs text-dim">The first device to open it takes the seat for 30 days.</p>
              </div>
            ) : (
              <output className="block text-sm text-dim">Preparing the link…</output>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title={`Take back ${name}’s seat?`}
        description="Their device stops playing it and you play their side again. Share the new link if they want to rejoin."
        cancel="Keep their seat"
        confirm="Take it back"
        destructive
        pending={replace.isPending}
        error={replace.error}
        onClose={() => setConfirming(false)}
        onConfirm={() => replace.mutate()}
      />
    </>
  )
}
