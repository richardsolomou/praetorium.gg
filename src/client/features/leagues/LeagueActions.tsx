import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Clipboard, EllipsisVertical, Eye, Pencil, Share2, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { deleteLeague } from '../../functions'

import { LeagueSettingsDialog } from './LeagueSettingsDialog'
import { eventFullName, eventLink, eventName, eventPath, leagueNoun, useLeagueRefresh } from './leagueEvent'
import type { TableShape } from '../../../core/tableShape'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FloatingNotice } from '../../components/FloatingNotice'
import { useNativeShare } from '../../nativeBridge'
import { shareButtonLabel, useShareLink } from '../../useShareLink'

type ManageableLeague = {
  token: string
  tournament: { name: string } | null
  club: { token: string; name: string } | null
  format?: TableShape | null
  rosterLimit?: number | null
  pointsBudget?: number | null
}

/** One frame for every league card, so a card with organizer actions looks like one without. */
export const LEAGUE_CARD = 'relative flex min-w-0 flex-col border border-edge bg-panel transition-colors hover:border-info hover:bg-raised'

/** `canDelete` is a tournament owner's alone; an admin runs the tournament but cannot remove it. */
export function LeagueCardActions({
  league,
  canDelete,
  children,
}: {
  league: ManageableLeague
  canDelete: boolean
  children: (menu: ReactNode) => ReactNode
}) {
  const actions = useLeagueActions(league)
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger render={<article data-league={league.token} className={LEAGUE_CARD} />}>
          {children(
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${eventName(actions.league)}`} />}
              >
                <EllipsisVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <LeagueActionItems Item={DropdownMenuItem} actions={actions} canDelete={canDelete} />
              </DropdownMenuContent>
            </DropdownMenu>,
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <LeagueActionItems Item={ContextMenuItem} actions={actions} canDelete={canDelete} />
        </ContextMenuContent>
      </ContextMenu>
      <LeagueActionDialogs actions={actions} />
      <LeagueActionFeedback feedback={actions.copyFeedback} />
    </>
  )
}

/** The league page's own controls: its settings in the open, and the rarely wanted deletion behind the menu. */
export function LeaguePageActions({ actions, canDelete }: { actions: LeagueActionsController; canDelete: boolean }) {
  return (
    <>
      <Button variant="outline" onClick={actions.openEdit}>
        <Pencil /> Edit {actions.noun}
      </Button>
      {canDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More for ${eventName(actions.league)}`} />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem variant="destructive" onClick={actions.openDeleting}>
              <Trash2 /> Delete {actions.noun}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <LeagueActionDialogs actions={actions} />
    </>
  )
}

function LeagueActionItems({
  Item,
  actions,
  canDelete,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  actions: LeagueActionsController
  canDelete: boolean
}) {
  const nativeShare = useNativeShare()
  return (
    <>
      <Item render={<Link {...eventLink(actions.league)} />}>
        <Eye /> View {actions.noun}
      </Item>
      <Item onClick={actions.copyInvite}>
        {actions.copyFeedback === 'shared' ? <Share2 /> : actions.copyFeedback === 'copied' ? <Check /> : <Clipboard />}{' '}
        {shareButtonLabel(actions.copyFeedback, nativeShare, 'invite')}
      </Item>
      <Item onClick={actions.openEdit}>
        <Pencil /> Edit {actions.noun}
      </Item>
      {canDelete ? (
        <Item variant="destructive" onClick={actions.openDeleting}>
          <Trash2 /> Delete {actions.noun}
        </Item>
      ) : null}
    </>
  )
}

function LeagueActionDialogs({ actions }: { actions: LeagueActionsController }) {
  return (
    <>
      <LeagueSettingsDialog mode={{ kind: 'edit', token: actions.league.token }} open={actions.editing} onOpenChange={actions.setEditing} />
      <ConfirmDialog
        open={actions.deleting}
        title={actions.league.tournament ? `Delete ${actions.league.tournament.name}?` : `Delete this ${actions.noun}?`}
        description="Every entrant and sealed roster goes with it, for good. Battles already started from it stay where they are."
        cancel={`Keep ${actions.noun}`}
        confirm={`Delete ${actions.noun}`}
        pendingLabel="Deleting…"
        destructive
        pending={actions.remove.isPending}
        error={actions.remove.error}
        onClose={() => actions.setDeleting(false)}
        onConfirm={() => actions.remove.mutate()}
      >
        {actions.remove.isPending ? <output className="sr-only">Deleting the {actions.noun}…</output> : null}
      </ConfirmDialog>
    </>
  )
}

function LeagueActionFeedback({ feedback }: { feedback: InviteFeedback }) {
  if (!feedback) return null
  return (
    <FloatingNotice className="z-60 block w-[calc(100%-2rem)] max-w-md border-edge px-4 py-3">
      {inviteFeedbackText(feedback)}
    </FloatingNotice>
  )
}

type InviteFeedback = 'copied' | 'error' | 'shared' | null

export function inviteFeedbackText(feedback: Exclude<InviteFeedback, null>) {
  return feedback === 'shared' ? 'Invite shared.' : feedback === 'copied' ? 'Invite link copied.' : 'Could not share the invite. Try again.'
}

/** Copies an invite to `path`, or hands it to the native share sheet, and says which happened for a few seconds. */
export function useInviteShare(path: string, name: string, event: 'league_invite_shared' | 'club_invite_shared') {
  const link = useShareLink(event)
  const feedback: InviteFeedback = link.problem ? 'error' : link.shared
  const { reset } = link
  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(reset, 4_000)
    return () => window.clearTimeout(timeout)
  }, [feedback, reset])
  return { feedback, clear: reset, share: () => link.share(`${window.location.origin}${path}`, name) }
}

type LeagueActionsController = ReturnType<typeof useLeagueActions>

export function useLeagueActions(league: ManageableLeague, onDeleted?: () => void | Promise<void>) {
  const refreshLeague = useLeagueRefresh(league.token)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const invite = useInviteShare(eventPath(league), eventFullName(league), 'league_invite_shared')
  const remove = useMutation({
    mutationFn: () => deleteLeague({ data: { token: league.token } }),
    onSettled: refreshLeague,
    onSuccess: async () => {
      await onDeleted?.()
      setDeleting(false)
    },
  })
  return {
    league,
    noun: leagueNoun(league).noun,
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
