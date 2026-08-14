import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Copy, EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { RosterSetupDialog, type RosterSetup } from '../client/components/RosterSetupDialog'
import { readWorkspaceState, writeWorkspaceState } from '../client/components/workspaceState'
import { factionsQuery, savedRostersQuery } from '../client/queries'
import { GAME_SIZES, ROSTER_NAME_MAX_LENGTH } from '../core/battle'
import { deleteRoster, saveRoster } from '../server/functions'

type Search = { limit?: number }
type EditingSession = { rosterId: string; draft: RosterSetup }

const WORKSPACE_PATH = '/rosters/'
const EDITING_STATE = 'roster-setup'

function readEditingSession(): EditingSession | null {
  return readWorkspaceState<EditingSession>(WORKSPACE_PATH, EDITING_STATE)
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
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const { data: available } = useQuery(factionsQuery())
  const { limit } = Route.useSearch()
  const shown = limit === undefined ? saved : saved.filter((roster) => roster.limit === limit)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<(typeof saved)[number] | null>(null)
  const [editingSession, setEditingSession] = useState<EditingSession | null>(null)
  const editing = saved.find((roster) => roster.id === editingSession?.rosterId) ?? null
  const queryClient = useQueryClient()
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
      },
    })
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: savedRostersQuery().queryKey })
  const duplicate = useMutation({
    mutationFn: (roster: (typeof saved)[number]) =>
      saveRoster({
        data: {
          id: crypto.randomUUID(),
          name: `Copy of ${roster.name}`.slice(0, ROSTER_NAME_MAX_LENGTH),
          catalogueId: roster.catalogueId,
          detachmentIds: roster.detachmentIds,
          disposition: roster.disposition,
          limit: roster.limit,
          picks: roster.picks,
          prep: roster.prep,
        },
      }),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: (id: string) => deleteRoster({ data: { id } }), onSuccess: refresh })
  const update = useMutation({
    mutationFn: ({ roster, setup }: { roster: (typeof saved)[number]; setup: RosterSetup }) =>
      saveRoster({
        data: {
          id: roster.id,
          ...setup,
          picks: setup.catalogueId === roster.catalogueId ? roster.picks : [],
          prep: roster.prep,
        },
      }),
    onSuccess: async () => {
      await refresh()
      setSetupDraft(null)
    },
  })

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
            variant="outline"
            size="xs"
            className={`chip ${limit === size.limit ? 'border-azure text-azure' : ''}`}
          >
            {size.name} · {size.limit}
          </Button>
        ))}
      </div>

      <section className="mt-4">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          <span className="readout">{shown.length}</span>
        </p>
        <div className="mt-2 space-y-2">
          {shown.length ? (
            shown.map((roster) => (
              <ContextMenu key={roster.id}>
                <ContextMenuTrigger
                  render={<article className="flex items-center gap-2 border border-edge bg-panel p-2 hover:border-azure" />}
                >
                  <Link to="/rosters/$id/edit" params={{ id: roster.id }} className="min-w-0 flex-1 p-1 text-left">
                    <span className="block truncate font-bold uppercase">{roster.name}</span>
                    <span className="text-xs text-dim">
                      {roster.picks.length} units · updated {new Date(roster.updatedAt).toLocaleDateString()}
                    </span>
                  </Link>
                  <span className="chip shrink-0">{roster.limit} pts</span>
                  <DropdownMenu open={menuFor === roster.id} onOpenChange={(open) => setMenuFor(open ? roster.id : null)}>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${roster.name}`} />}>
                      <EllipsisVertical />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-none border border-edge bg-panel text-bone">
                      <DropdownMenuItem onClick={() => edit(roster)}>
                        <Pencil /> Edit
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
                  <ContextMenuItem onClick={() => edit(roster)}>
                    <Pencil /> Edit
                  </ContextMenuItem>
                  <ContextMenuItem disabled={duplicate.isPending} onClick={() => duplicate.mutate(roster)}>
                    <Copy /> Duplicate
                  </ContextMenuItem>
                  <ContextMenuItem variant="destructive" disabled={remove.isPending} onClick={() => setDeleting(roster)}>
                    <Trash2 /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))
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
            }
          }
          onDraftChange={(draft) => setSetupDraft({ rosterId: editing.id, draft })}
          hasUnits={Boolean(editing.picks.length)}
          pending={update.isPending}
          onSave={(setup) => update.mutate({ roster: editing, setup })}
        />
      ) : null}
    </main>
  )
}
