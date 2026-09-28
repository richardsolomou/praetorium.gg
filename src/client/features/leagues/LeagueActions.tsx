import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Clipboard, EllipsisVertical, Eye, Pencil, Share2, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { LeagueAdmission, LeagueVisibility } from '../../../core/league'
import type { TableShape } from '../../../core/tableShape'
import { deleteLeague, updateLeague } from '../../../server/functions'
import { leaguesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { shareLink } from '../../nativeBridge'
import { LeagueFormFields, type LeagueFormValue } from './LeagueForm'

export type ManageableLeague = {
  token: string
  name: string
  description: string
  visibility: LeagueVisibility
  admission: LeagueAdmission
  playerLimit: number | null
  format: TableShape | null
  currentEventFormat: TableShape | null
  currentEventRevealedAt: number | null
  currentAcceptedCount: number
}

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

/** The league page's own menu: the console carries the invite, so the menu keeps only what changes the league itself. */
export function LeaguePageActions({ actions }: { actions: LeagueActionsController }) {
  return (
    <>
      <LeagueMenu actions={actions} showShare={false} />
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
      <Dialog open={actions.editing} onOpenChange={(open) => !actions.update.isPending && actions.setEditing(open)}>
        <DialogContent showCloseButton={!actions.update.isPending} aria-busy={actions.update.isPending} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Edit league</DialogTitle>
            <DialogDescription>
              Applies from now on. Nothing already entered, sealed, or played changes. Switching to automatic lets in anyone still waiting.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              actions.update.mutate()
            }}
          >
            <LeagueFormFields
              idPrefix="edit-league"
              value={actions.value}
              acceptedCount={actions.league.currentEventRevealedAt === null ? actions.league.currentAcceptedCount : 0}
              minimumPlayerLimit={
                actions.league.currentEventRevealedAt === null
                  ? actions.league.currentEventFormat === '2v2'
                    ? 4
                    : actions.league.currentEventFormat === '2v1'
                      ? 3
                      : 2
                  : 2
              }
              evenPlayerLimit={actions.league.currentEventRevealedAt === null && actions.league.currentEventFormat === '2v2'}
              disabled={actions.update.isPending}
              onChange={actions.setValue}
            />
            {actions.update.isPending ? <output className="sr-only">Saving league changes…</output> : null}
            {actions.update.error ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(actions.update.error)}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={actions.update.isPending} onClick={() => actions.setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={actions.update.isPending || !actions.value.name.trim()}>
                {actions.update.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
        setFeedback(await shareLink(leagueInviteUrl(league.token), league.name))
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
  const [value, setValue] = useState<LeagueFormValue>(formValue(league))
  useEffect(() => {
    setValue((current) =>
      league.currentEventRevealedAt === null && current.playerLimit !== null && current.playerLimit < league.currentAcceptedCount
        ? { ...current, playerLimit: league.playerLimit }
        : current,
    )
  }, [league.currentAcceptedCount, league.currentEventRevealedAt, league.playerLimit])
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['league', league.token] }),
      queryClient.invalidateQueries({ queryKey: leaguesQuery().queryKey }),
    ])
  }
  const update = useMutation({
    mutationFn: () => updateLeague({ data: { token: league.token, ...value } }),
    onError: refresh,
    onSuccess: async () => {
      await refresh()
      setEditing(false)
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteLeague({ data: { token: league.token } }),
    onError: refresh,
    onSuccess: async () => {
      await refresh()
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
    value,
    setValue,
    update,
    remove,
    openEdit: () => {
      invite.clear()
      update.reset()
      setValue(formValue(league))
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

function formValue(league: ManageableLeague): LeagueFormValue {
  return {
    name: league.name,
    description: league.description,
    visibility: league.visibility,
    admission: league.admission,
    playerLimit: league.playerLimit,
  }
}
