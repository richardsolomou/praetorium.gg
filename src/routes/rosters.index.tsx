import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Copy, Download, EllipsisVertical, Eye, Link2, Lock, Pencil, Printer, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { CreateRoster } from '../client/components/CreateRoster'
import { RosterImport } from '../client/components/RosterImport'
import { RosterExportDialog } from '../client/components/RosterExportDialog'
import { RosterSetupDialog, type RosterSetup } from '../client/components/RosterSetupDialog'
import { FactionLabel } from '../client/components/FactionMark'
import { readWorkspaceState, writeWorkspaceState } from '../client/components/workspaceState'
import { SignInRequired } from '../client/components/SignInRequired'
import { factionsQuery, meQuery, priceQuery, savedRostersQuery } from '../client/queries'
import { errorMessage } from '../client/queryClient'
import { useOrigin } from '../client/useOrigin'
import { GAME_SIZES, ROSTER_NAME_MAX_LENGTH } from '../core/battle'
import type { RosterPick } from '../core/roster'
import { ROSTER_SOURCE_LABELS } from '../core/savedRoster'
import { deleteRoster, exportRoster, saveRoster, setRosterVisibility } from '../server/functions'

type Search = { limit?: number }
type EditingSession = { rosterId: string; draft: RosterSetup }

const WORKSPACE_PATH = '/rosters/'
const EDITING_STATE = 'roster-setup'

function readEditingSession(): EditingSession | null {
  return readWorkspaceState<EditingSession>(WORKSPACE_PATH, EDITING_STATE)
}

function RosterPoints({
  catalogueId,
  detachmentIds,
  disposition,
  limit,
  picks,
}: {
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  picks: RosterPick[]
}) {
  const element = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!element.current || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  const { data } = useQuery({ ...priceQuery(catalogueId, detachmentIds, disposition, limit, picks), enabled: visible })
  return (
    <span ref={element} className="readout block text-lg font-bold">
      {data?.points ?? '—'}/{limit}
    </span>
  )
}

export const Route = createFileRoute('/rosters/')({
  validateSearch: (search: Record<string, unknown>): Search => {
    const limit = Number(search.limit)
    return GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}
  },
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(savedRostersQuery()), context.queryClient.ensureQueryData(factionsQuery())]),
  component: RosterLibrary,
})

function RosterLibrary() {
  const { data: me } = useQuery(meQuery())
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const { data: available } = useQuery(factionsQuery())
  const { limit } = Route.useSearch()
  const shown = limit === undefined ? saved : saved.filter((roster) => roster.limit === limit)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [copiedFor, setCopiedFor] = useState<string | null>(null)
  const [shareProblem, setShareProblem] = useState<string | null>(null)
  const [exportText, setExportText] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<(typeof saved)[number] | null>(null)
  const [editingSession, setEditingSession] = useState<EditingSession | null>(null)
  const editing = saved.find((roster) => roster.id === editingSession?.rosterId) ?? null
  const queryClient = useQueryClient()
  const origin = useOrigin()
  useEffect(() => setEditingSession(readEditingSession()), [])
  const setSetupDraft = (session: EditingSession | null) => {
    setEditingSession(session)
    writeWorkspaceState(WORKSPACE_PATH, EDITING_STATE, session)
  }
  const edit = (roster: (typeof saved)[number]) => {
    setSetupDraft({
      rosterId: roster.id,
      draft: {
        name: roster.name,
        catalogueId: roster.catalogueId,
        detachmentIds: roster.detachmentIds,
        disposition: roster.disposition,
        limit: roster.limit,
        visibility: roster.visibility,
      },
    })
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: savedRostersQuery().queryKey })
  const duplicate = useMutation({
    mutationFn: (roster: (typeof saved)[number]) =>
      saveRoster({
        data: {
          name: `Copy of ${roster.name}`.slice(0, ROSTER_NAME_MAX_LENGTH),
          catalogueId: roster.catalogueId,
          detachmentIds: roster.detachmentIds,
          disposition: roster.disposition,
          limit: roster.limit,
          picks: roster.picks,
          prep: roster.prep,
          visibility: roster.visibility,
          source: roster.source,
        },
      }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (id: string) => deleteRoster({ data: { id } }), onSuccess: refresh })
  const access = useMutation({
    mutationFn: ({ id, visibility }: { id: string; visibility: 'private' | 'unlisted' }) =>
      setRosterVisibility({ data: { id, visibility } }),
    onSuccess: refresh,
  })
  const take = useMutation({
    mutationFn: (roster: (typeof saved)[number]) =>
      exportRoster({
        data: {
          catalogueId: roster.catalogueId,
          detachmentIds: roster.detachmentIds,
          disposition: roster.disposition,
          limit: roster.limit,
          name: roster.name,
          units: roster.picks,
        },
      }),
    onSuccess: ({ text }) => setExportText(text),
  })
  const share = async (roster: (typeof saved)[number]) => {
    const promoted = roster.visibility === 'private'
    setShareProblem(null)
    try {
      if (promoted) await access.mutateAsync({ id: roster.id, visibility: 'unlisted' })
      await navigator.clipboard.writeText(`${origin}/rosters/${roster.id}`)
      setCopiedFor(roster.id)
    } catch (error) {
      let problem = errorMessage(error)
      if (promoted) {
        try {
          await access.mutateAsync({ id: roster.id, visibility: 'private' })
        } catch (rollbackError) {
          problem = `${problem}. The roster could not be made private again: ${errorMessage(rollbackError)}`
        }
      }
      setShareProblem(problem)
    }
  }
  const print = (id: string) => {
    window.open(`/rosters/${id}?print=true`, '_blank')
  }
  const update = useMutation({
    mutationFn: ({ roster, setup }: { roster: (typeof saved)[number]; setup: RosterSetup }) =>
      saveRoster({
        data: {
          id: roster.id,
          ...setup,
          picks: setup.catalogueId === roster.catalogueId ? roster.picks : [],
          prep: roster.prep,
          visibility: setup.visibility,
          source: roster.source,
        },
      }),
    onSuccess: async () => {
      await refresh()
      setSetupDraft(null)
    },
  })

  if (!me) return <SignInRequired title="Your rosters" explanation="Sign in to build a list and keep it between battles." />

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your rosters</p>
          <h1 className="text-3xl">My rosters</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <RosterImport />
          {available ? <CreateRoster factions={available.factions} /> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Battle size filter">
        <span className="eyebrow mr-1">Battle size</span>
        <Button
          render={<Link to="/rosters" search={{}} />}
          nativeButton={false}
          variant="outline"
          size="xs"
          className={`chip ${limit === undefined ? 'border-azure text-azure' : ''}`}
        >
          All
        </Button>
        {GAME_SIZES.map((size) => (
          <Button
            key={size.limit}
            render={<Link to="/rosters" search={{ limit: size.limit }} />}
            nativeButton={false}
            variant="outline"
            size="xs"
            className={`chip ${limit === size.limit ? 'border-azure text-azure' : ''}`}
          >
            {size.name} · {size.limit}
          </Button>
        ))}
      </div>
      {shareProblem ? <p className="mt-3 text-sm text-destructive">Could not copy the link: {shareProblem}</p> : null}

      <section className="mt-4">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          <span className="readout">{shown.length}</span>
        </p>
        <div className="mt-2 space-y-2">
          {shown.length ? (
            shown.map((roster) => {
              const faction = available?.factions.find((entry) => entry.id === roster.catalogueId)
              const detachments = roster.detachmentIds
                .map((id) => faction?.detachments.find((entry) => entry.id === id)?.name)
                .filter(Boolean)
              const size = GAME_SIZES.find((entry) => entry.limit === roster.limit)
              return (
                <ContextMenu key={roster.id}>
                  <ContextMenuTrigger
                    render={<article className="flex items-center gap-2 border border-edge bg-panel p-2 hover:border-azure" />}
                  >
                    <Link to="/rosters/$id" params={{ id: roster.id }} className="min-w-0 flex-1 p-1 text-left">
                      <span className="block truncate font-bold uppercase">{roster.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {faction ? <FactionLabel faction={faction} chip /> : null}
                        {detachments.map((name) => (
                          <span key={name} className="chip">
                            {name}
                          </span>
                        ))}
                      </span>
                      <span className="mt-1 block text-xs text-dim">
                        11th edition · {size?.name ?? `${roster.limit} points`} · {roster.picks.length} units ·{' '}
                        {ROSTER_SOURCE_LABELS[roster.source]} · updated {new Date(roster.updatedAt).toLocaleDateString()}
                      </span>
                    </Link>
                    <span className="shrink-0 text-right">
                      <RosterPoints
                        catalogueId={roster.catalogueId}
                        detachmentIds={roster.detachmentIds}
                        disposition={roster.disposition}
                        limit={roster.limit}
                        picks={roster.picks}
                      />
                      <span className="text-xs text-dim">{roster.visibility === 'private' ? 'Private' : 'Unlisted'}</span>
                    </span>
                    <DropdownMenu open={menuFor === roster.id} onOpenChange={(open) => setMenuFor(open ? roster.id : null)}>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${roster.name}`} />}>
                        <EllipsisVertical />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 rounded-none border border-edge bg-panel text-bone">
                        <DropdownMenuItem render={<Link to="/rosters/$id" params={{ id: roster.id }} target="_blank" />}>
                          <Eye /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => print(roster.id)}>
                          <Printer /> Print
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!origin || access.isPending} onClick={() => void share(roster)}>
                          <Link2 />{' '}
                          {copiedFor === roster.id ? 'Link copied' : roster.visibility === 'private' ? 'Share unlisted link' : 'Copy link'}
                        </DropdownMenuItem>
                        {roster.visibility === 'unlisted' ? (
                          <DropdownMenuItem
                            disabled={access.isPending}
                            onClick={() => access.mutate({ id: roster.id, visibility: 'private' })}
                          >
                            <Lock /> Make private
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem disabled={take.isPending} onClick={() => take.mutate(roster)}>
                          <Download /> Export GW text
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => edit(roster)}>
                          <Pencil /> Edit setup
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={duplicate.isPending} onClick={() => duplicate.mutate(roster)}>
                          <Copy /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" disabled={remove.isPending} onClick={() => setDeleting(roster)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="rounded-none border border-edge bg-panel text-bone">
                    <ContextMenuItem onClick={() => print(roster.id)}>
                      <Printer /> Print
                    </ContextMenuItem>
                    <ContextMenuItem disabled={!origin || access.isPending} onClick={() => void share(roster)}>
                      <Link2 /> {roster.visibility === 'private' ? 'Share unlisted link' : 'Copy link'}
                    </ContextMenuItem>
                    <ContextMenuItem disabled={take.isPending} onClick={() => take.mutate(roster)}>
                      <Download /> Export GW text
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => edit(roster)}>
                      <Pencil /> Edit setup
                    </ContextMenuItem>
                    <ContextMenuItem disabled={duplicate.isPending} onClick={() => duplicate.mutate(roster)}>
                      <Copy /> Duplicate
                    </ContextMenuItem>
                    <ContextMenuItem variant="destructive" disabled={remove.isPending} onClick={() => setDeleting(roster)}>
                      <Trash2 /> Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })
          ) : (
            <p className="border border-edge bg-panel p-8 text-center text-sm text-dim">
              {saved.length ? 'No rosters at this battle size.' : 'No rosters yet. Create one or bring one from another app.'}
            </p>
          )}
        </div>
      </section>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              This removes the saved roster. Battles that already use it are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="rounded-none border-edge bg-sunken">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete roster
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {available && editing ? (
        <RosterSetupDialog
          open
          onOpenChange={(open) => !open && setSetupDraft(null)}
          factions={available.factions}
          value={
            editingSession?.draft ?? {
              name: editing.name,
              catalogueId: editing.catalogueId,
              detachmentIds: editing.detachmentIds,
              disposition: editing.disposition,
              limit: editing.limit,
              visibility: editing.visibility,
            }
          }
          onDraftChange={(draft) => setSetupDraft({ rosterId: editing.id, draft })}
          hasUnits={Boolean(editing.picks.length)}
          pending={update.isPending}
          onSave={(setup) => update.mutate({ roster: editing, setup })}
        />
      ) : null}
      <RosterExportDialog text={exportText} onClose={() => setExportText(null)} />
    </main>
  )
}
