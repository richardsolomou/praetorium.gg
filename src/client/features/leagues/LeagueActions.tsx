import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Clipboard, EllipsisVertical, Eye, Pencil, Share2, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { deleteLeague } from '../../functions'
import { shareLink } from '../../nativeBridge'
import { LeagueSettingsDialog } from './LeagueSettingsDialog'
import { eventFullName, eventLink, eventName, eventPath, leagueNoun, useLeagueRefresh } from './leagueEvent'
import type { TableShape } from '../../../core/tableShape'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useInviteShareLabel } from '../friends/friendInvite'

type ManageableLeague = {
  token: string
  name: string
  club?: { token: string; name?: string } | null
  format?: TableShape | null
  rosterLimit?: number | null
  pointsBudget?: number | null
}

/** One frame for every league card, so a card with organizer actions looks like one without. */
export const LEAGUE_CARD = 'relative flex min-w-0 flex-col border border-edge bg-panel transition-colors hover:border-info hover:bg-raised'

/** `canDelete` is the owner's alone; an admin runs the league but cannot remove it. */
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
          {children(<LeagueMenu actions={actions} showView canDelete={canDelete} />)}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <LeagueActionItems Item={ContextMenuItem} actions={actions} showView showShare canDelete={canDelete} />
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

function LeagueMenu({
  actions,
  showView = false,
  showShare = true,
  canDelete,
}: {
  actions: LeagueActionsController
  showView?: boolean
  showShare?: boolean
  canDelete: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${eventName(actions.league)}`} />}>
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <LeagueActionItems Item={DropdownMenuItem} actions={actions} showView={showView} showShare={showShare} canDelete={canDelete} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LeagueActionItems({
  Item,
  actions,
  showView,
  showShare,
  canDelete,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  actions: LeagueActionsController
  showView: boolean
  showShare: boolean
  canDelete: boolean
}) {
  const shareLabel = useInviteShareLabel()
  return (
    <>
      {showView ? (
        <Item render={<Link {...eventLink(actions.league)} />}>
          <Eye /> View {actions.noun}
        </Item>
      ) : null}
      {showShare ? (
        <Item onClick={actions.copyInvite}>
          {actions.copyFeedback === 'shared' ? <Share2 /> : actions.copyFeedback === 'copied' ? <Check /> : <Clipboard />}{' '}
          {actions.copyFeedback === 'shared' ? 'Invite shared' : actions.copyFeedback === 'copied' ? 'Invite link copied' : shareLabel}
        </Item>
      ) : null}
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
        title={actions.league.club ? `Delete this ${actions.noun}?` : `Delete ${actions.league.name}?`}
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
    <p
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-60 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 border border-edge bg-panel px-4 py-3 text-sm shadow-lg"
    >
      {inviteFeedbackText(feedback)}
    </p>
  )
}

type InviteFeedback = 'copied' | 'error' | 'shared' | null

export function inviteFeedbackText(feedback: Exclude<InviteFeedback, null>) {
  return feedback === 'shared' ? 'Invite shared.' : feedback === 'copied' ? 'Invite link copied.' : 'Could not share the invite. Try again.'
}

/** Copies an invite to `path`, or hands it to the native share sheet, and says which happened for a few seconds. */
export function useInviteShare(path: string, name: string, event: 'league_invite_shared' | 'club_invite_shared') {
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
        const result = await shareLink(`${window.location.origin}${path}`, name)
        setFeedback(result)
        posthog.capture(event, { method: result })
      } catch {
        setFeedback('error')
      }
    },
  }
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
