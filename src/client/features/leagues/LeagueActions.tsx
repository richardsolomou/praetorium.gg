import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Clipboard, EllipsisVertical, Eye, Pencil, Share2, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { posthog } from 'posthog-js'
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
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { deleteLeague } from '../../../server/functions'
import { leaguesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { shareLink } from '../../nativeBridge'
import { LeagueSettingsDialog } from './LeagueSettingsDialog'

export type ManageableLeague = { token: string; name: string }

export function LeagueCardActions({ league, children }: { league: ManageableLeague; children: (menu: ReactNode) => ReactNode }) {
  const actions = useLeagueActions(league)
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          render={<article data-league={league.token} className="min-w-0 border border-edge bg-panel hover:border-info hover:bg-raised" />}
        >
          {children(<LeagueMenu actions={actions} showView />)}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <LeagueActionItems Item={ContextMenuItem} actions={actions} showView showShare />
        </ContextMenuContent>
      </ContextMenu>
      <LeagueActionDialogs actions={actions} />
      <LeagueActionFeedback feedback={actions.copyFeedback} />
    </>
  )
}

/** The league page's own controls: its settings in the open, and the rarely wanted deletion behind the menu. */
export function LeaguePageActions({ actions }: { actions: LeagueActionsController }) {
  return (
    <>
      <Button variant="outline" className="pointer-coarse:h-11" onClick={actions.openEdit}>
        <Pencil /> Edit league
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="pointer-coarse:size-11" aria-label={`More for ${actions.league.name}`} />}
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem variant="destructive" onClick={actions.openDeleting}>
            <Trash2 /> Delete league
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LeagueActionDialogs actions={actions} />
    </>
  )
}

function LeagueMenu({
  actions,
  showView = false,
  showShare = true,
}: {
  actions: LeagueActionsController
  showView?: boolean
  showShare?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${actions.league.name}`} />}>
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <LeagueActionItems Item={DropdownMenuItem} actions={actions} showView={showView} showShare={showShare} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LeagueActionItems({
  Item,
  actions,
  showView,
  showShare,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  actions: LeagueActionsController
  showView: boolean
  showShare: boolean
}) {
  return (
    <>
      {showView ? (
        <Item render={<Link to="/leagues/$token" params={{ token: actions.league.token }} />}>
          <Eye /> View league
        </Item>
      ) : null}
      {showShare ? (
        <Item onClick={actions.copyInvite}>
          {actions.copyFeedback === 'shared' ? <Share2 /> : actions.copyFeedback === 'copied' ? <Check /> : <Clipboard />}{' '}
          {actions.copyFeedback === 'shared' ? 'Invite shared' : actions.copyFeedback === 'copied' ? 'Invite link copied' : 'Share invite'}
        </Item>
      ) : null}
      <Item onClick={actions.openEdit}>
        <Pencil /> Edit league
      </Item>
      <Item variant="destructive" onClick={actions.openDeleting}>
        <Trash2 /> Delete league
      </Item>
    </>
  )
}

function LeagueActionDialogs({ actions }: { actions: LeagueActionsController }) {
  return (
    <>
      <LeagueSettingsDialog mode={{ kind: 'edit', token: actions.league.token }} open={actions.editing} onOpenChange={actions.setEditing} />
      <AlertDialog open={actions.deleting} onOpenChange={(open) => !actions.remove.isPending && actions.setDeleting(open)}>
        <AlertDialogContent aria-busy={actions.remove.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {actions.league.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every event, entrant, and sealed list goes with it, for good. Battles already started from it stay where they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actions.remove.isPending ? <output className="sr-only">Deleting the league…</output> : null}
          {actions.remove.error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(actions.remove.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actions.remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={actions.remove.isPending} onClick={() => actions.remove.mutate()}>
              {actions.remove.isPending ? 'Deleting…' : 'Delete league'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function LeagueActionFeedback({ feedback }: { feedback: InviteFeedback }) {
  if (!feedback) return null
  return (
    <p
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-60 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 border border-edge bg-panel px-4 py-3 text-sm shadow-lg"
    >
      {inviteFeedbackText(feedback)}
    </p>
  )
}

export type InviteFeedback = 'copied' | 'error' | 'shared' | null

export function inviteFeedbackText(feedback: Exclude<InviteFeedback, null>) {
  return feedback === 'shared' ? 'Invite shared.' : feedback === 'copied' ? 'Invite link copied.' : 'Could not share the invite. Try again.'
}

/** Copies a league's invite, or hands it to the native share sheet, and says which happened for a few seconds. */
export function useInviteShare(league: { token: string; name: string }) {
  const [feedback, setFeedback] = useState<InviteFeedback>(null)
  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(() => setFeedback(null), 4_000)
    return () => window.clearTimeout(timeout)
  }, [feedback])
  return {
    feedback,
    clear: () => setFeedback(null),
    share: async () => {
      setFeedback(null)
      try {
        const result = await shareLink(leagueInviteUrl(league.token), league.name)
        setFeedback(result)
        posthog.capture('league_invite_shared', { method: result })
      } catch {
        setFeedback('error')
      }
    },
  }
}

function leagueInviteUrl(token: string) {
  return `${window.location.origin}/leagues/${token}`
}

export type LeagueActionsController = ReturnType<typeof useLeagueActions>

export function useLeagueActions(league: ManageableLeague, onDeleted?: () => void | Promise<void>) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const invite = useInviteShare(league)
  const remove = useMutation({
    mutationFn: () => deleteLeague({ data: { token: league.token } }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['league', league.token] }),
        queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey }),
      ]),
    onSuccess: async () => {
      await onDeleted?.()
      setDeleting(false)
    },
  })
  return {
    league,
    editing,
    setEditing,
    deleting,
    setDeleting,
    copyFeedback: invite.feedback,
    remove,
    openEdit: () => {
      invite.clear()
      setEditing(true)
    },
    openDeleting: () => {
      invite.clear()
      remove.reset()
      setDeleting(true)
    },
    copyInvite: invite.share,
  }
}
