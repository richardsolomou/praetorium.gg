import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QrCode } from 'lucide-react'
import { useEffect, useState, type ComponentProps } from 'react'
import { posthog } from 'posthog-js'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { activeFriendInviteQuery } from '../../queries'
import { cancelFriendInvite, createFriendInvite } from '../../functions'
import { errorMessage } from '../../queryClient'
import { shareLink } from '../../nativeBridge'
import { useOrigin } from '../../useOrigin'

/** What a share button reads once the link has gone out. */
export const SHARED_LABEL = { copied: 'Link copied', shared: 'Invite shared' } as const

/** The player's one-time friend invite: its link, and sharing, replacing or cancelling it. */
export function useFriendInvite() {
  const { data: invite } = useQuery(activeFriendInviteQuery())
  const queryClient = useQueryClient()
  const origin = useOrigin()
  const [feedback, setFeedback] = useState<'copied' | 'shared' | null>(null)
  const [shareProblem, setShareProblem] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: activeFriendInviteQuery().queryKey })
  const create = useMutation({ mutationFn: () => createFriendInvite(), onSuccess: refresh })
  const cancelMutation = useMutation({ mutationFn: () => cancelFriendInvite(), onSuccess: refresh })
  const shareToken = async (token: string) => {
    setShareProblem(null)
    try {
      const result = await shareLink(`${origin}/invite/${token}`, 'Join me on Praetorium')
      setFeedback(result)
      posthog.capture('friend_invite_shared', { method: result })
    } catch (error) {
      setShareProblem(errorMessage(error))
    }
  }
  const shareNew = async () => {
    setFeedback(null)
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
    feedback,
    creating: create.isPending,
    busy: !origin || create.isPending || cancelMutation.isPending,
    problem: problem ? errorMessage(problem) : shareProblem,
    /** Shares the current link, making one first when there is none. */
    share: () => (invite ? shareToken(invite.token) : shareNew()),
    shareNew,
    cancel: () => {
      setFeedback(null)
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
  const [image, setImage] = useState<{ url: string; data: string } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open) return
    let active = true
    setFailed(false)
    void import('qrcode')
      .then(({ default: qr }) => qr.toDataURL(url, { width: 256, margin: 2 }))
      .then((data) => {
        if (active) setImage({ url, data })
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [open, url])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" {...trigger} disabled={disabled} />}>
        <QrCode /> Scan invite
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite a friend</DialogTitle>
          <DialogDescription>
            Your friend can scan this one-time link, sign in or create an account, then accept your invite.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            Could not make a QR code. Close this window and use Share invite.
          </p>
        ) : image?.url === url ? (
          <img src={image.data} alt="Friend invite QR code" className="mx-auto size-64 bg-white" />
        ) : (
          <output className="text-sm text-dim">Preparing the invite…</output>
        )}
        <p className="break-all text-xs text-dim">{url}</p>
      </DialogContent>
    </Dialog>
  )
}
