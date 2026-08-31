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
  currentEntrantCount: number
  currentAcceptedCount: number
}

type Controller = ReturnType<typeof useLeagueActions>

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
        <ContextMenuContent className="w-56 rounded-none border border-edge bg-panel text-bone">
          <LeagueActionItems Item={ContextMenuItem} actions={actions} showView />
        </ContextMenuContent>
      </ContextMenu>
      <LeagueActionDialogs actions={actions} />
      <LeagueActionFeedback feedback={actions.copyFeedback} />
    </>
  )
}

export function LeaguePageActions({ league, onDeleted }: { league: ManageableLeague; onDeleted: () => void | Promise<void> }) {
  const actions = useLeagueActions(league, onDeleted)
  return (
    <>
      <LeagueMenu actions={actions} />
      <LeagueActionDialogs actions={actions} />
      <LeagueActionFeedback feedback={actions.copyFeedback} />
    </>
  )
}

function LeagueMenu({ actions, showView = false }: { actions: Controller; showView?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${actions.league.name}`} />}>
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-none border border-edge bg-panel text-bone">
        <LeagueActionItems Item={DropdownMenuItem} actions={actions} showView={showView} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LeagueActionItems({
  Item,
  actions,
  showView,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  actions: Controller
  showView: boolean
}) {
  return (
    <>
      {showView ? (
        <Item render={<Link to="/leagues/$token" params={{ token: actions.league.token }} />}>
          <Eye /> View league
        </Item>
      ) : null}
      <Item onClick={actions.copyInvite}>
        {actions.copyFeedback === 'shared' ? <Share2 /> : actions.copyFeedback === 'copied' ? <Check /> : <Clipboard />}{' '}
        {actions.copyFeedback === 'shared' ? 'Invite shared' : actions.copyFeedback === 'copied' ? 'Invite link copied' : 'Share invite'}
      </Item>
      <Item onClick={actions.openEdit}>
        <Pencil /> Edit league
      </Item>
      <Item variant="destructive" onClick={actions.openDeleting}>
        <Trash2 /> Delete league
      </Item>
    </>
  )
}

function LeagueActionDialogs({ actions }: { actions: Controller }) {
  return (
    <>
      <Dialog open={actions.editing} onOpenChange={(open) => !actions.update.isPending && actions.setEditing(open)}>
        <DialogContent
          showCloseButton={!actions.update.isPending}
          aria-busy={actions.update.isPending}
          className="rounded-none border border-edge bg-panel text-bone sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl uppercase">Edit league</DialogTitle>
            <DialogDescription className="text-dim">
              Changes apply to the current and future registration. Existing event entries, sealed rosters, and battles do not change.
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
              admissionLocked={actions.league.currentEntrantCount > 0}
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
        <AlertDialogContent aria-busy={actions.remove.isPending} className="rounded-none border border-edge bg-panel text-bone">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Delete {actions.league.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              This permanently deletes every event, entry, and sealed league roster. Battles already started from this league stay
              available.
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

function LeagueActionFeedback({ feedback }: { feedback: 'copied' | 'error' | 'shared' | null }) {
  if (!feedback) return null
  return (
    <p
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-60 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 border border-edge bg-panel px-4 py-3 text-sm shadow-lg"
    >
      {feedback === 'shared' ? 'Invite shared.' : feedback === 'copied' ? 'Invite link copied.' : 'Could not share the invite. Try again.'}
    </p>
  )
}

function useLeagueActions(league: ManageableLeague, onDeleted?: () => void | Promise<void>) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<'copied' | 'error' | 'shared' | null>(null)
  const [value, setValue] = useState<LeagueFormValue>(formValue(league))
  useEffect(() => {
    if (!copyFeedback) return
    const timeout = window.setTimeout(() => setCopyFeedback(null), 4_000)
    return () => window.clearTimeout(timeout)
  }, [copyFeedback])
  useEffect(() => {
    setValue((current) => ({
      ...current,
      ...(league.currentEntrantCount > 0 ? { admission: league.admission } : {}),
      ...(league.currentEventRevealedAt === null && current.playerLimit !== null && current.playerLimit < league.currentAcceptedCount
        ? { playerLimit: league.playerLimit }
        : {}),
    }))
  }, [league.admission, league.currentAcceptedCount, league.currentEntrantCount, league.currentEventRevealedAt, league.playerLimit])
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
    copyFeedback,
    value,
    setValue,
    update,
    remove,
    openEdit: () => {
      setCopyFeedback(null)
      update.reset()
      setValue(formValue(league))
      setEditing(true)
    },
    openDeleting: () => {
      setCopyFeedback(null)
      remove.reset()
      setDeleting(true)
    },
    copyInvite: async () => {
      setCopyFeedback(null)
      try {
        setCopyFeedback(await shareLink(`${window.location.origin}/leagues/${league.token}`, league.name))
      } catch {
        setCopyFeedback('error')
      }
    },
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
