import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QrCode } from 'lucide-react'
import { useState, type ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/Dialog'
import { activeFriendInviteQuery } from '../../queries'
import { cancelFriendInvite, createFriendInvite } from '../../functions'
import { errorMessage } from '../../queryClient'
import { useNativeShare } from '../../nativeBridge'
import { useOrigin } from '../../useOrigin'
import { useQrCode } from '../../components/useQrCode'
import { Problem } from '../../components/Problem'
import { useShareLink } from '../../useShareLink'

/** What a share button reads once the link has gone out. */
export const SHARED_LABEL = { copied: 'Link copied', shared: 'Invite shared' } as const

/** What a share button reads before the invite goes out. */
export const useInviteShareLabel = () => (useNativeShare() ? 'Share invite' : 'Copy invite link')

/** The player's one-time friend invite: its link, and sharing, replacing or cancelling it. */
export function useFriendInvite() {
  const { data: invite } = useQuery(activeFriendInviteQuery())
  const queryClient = useQueryClient()
  const origin = useOrigin()
  const link = useShareLink('friend_invite_shared')
  const refresh = () => queryClient.invalidateQueries({ queryKey: activeFriendInviteQuery().queryKey })
  const create = useMutation({ mutationFn: () => createFriendInvite(), onSuccess: refresh })
  const cancelMutation = useMutation({ mutationFn: () => cancelFriendInvite(), onSuccess: refresh })
  const shareToken = (token: string) => link.share(`${origin}/invite/${token}`, 'Join me on Praetorium')
  const shareNew = async () => {
    link.reset()
    try {
      const created = await create.mutateAsync()
      await shareToken(created.token)
    } catch {
      // The mutation reports its own error.
    }
  }
  const problem = create.error ?? cancelMutation.error
  return {
    url: invite && origin ? `${origin}/invite/${invite.token}` : null,
    feedback: link.shared,
    creating: create.isPending,
    busy: !origin || create.isPending || cancelMutation.isPending,
    problem: problem || link.problem ? errorMessage(problem ?? link.problem) : null,
    /** Shares the current link, making one first when there is none. */
    share: () => (invite ? shareToken(invite.token) : shareNew()),
    shareNew,
    cancel: () => {
      link.reset()
      cancelMutation.mutate()
    },
  }
}

export function InviteQr({
  url,
  disabled,
  ...trigger
}: { url: string; disabled: boolean } & Pick<ComponentProps<typeof Button>, 'variant' | 'size'>) {
  const [open, setOpen] = useState(false)
  const { image, failed } = useQrCode(open ? url : null, 256)
  const shareLabel = useInviteShareLabel()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" {...trigger} disabled={disabled} />}>
        <QrCode /> Scan invite
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a friend</DialogTitle>
          <DialogDescription>
            Your friend can scan this one-time link, sign in or create an account, then accept your invite.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {failed ? (
            <Problem>Could not make a QR code. Close this window and use {shareLabel}.</Problem>
          ) : image ? (
            <img src={image} alt="Friend invite QR code" className="mx-auto size-64 bg-white" />
          ) : (
            <output className="text-sm text-dim">Preparing the invite…</output>
          )}
          <p className="break-all text-xs text-dim">{url}</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
