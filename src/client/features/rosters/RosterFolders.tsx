import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, EllipsisVertical, Folder, FolderInput, FolderOpen, FolderPlus, Inbox, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useState, type DragEvent } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { ContextMenuItem, DropdownMenuItem } from '../../components/Menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  addRosterFolder,
  childFolders,
  fileRosters,
  folderAndInside,
  folderPath,
  folderTree,
  moveRosterFolder,
  NO_ROSTER_FOLDERS,
  removeRosterFolder,
  renameRosterFolder,
  ROSTER_FOLDER_DEPTH_MAX,
  ROSTER_FOLDER_NAME_MAX_LENGTH,
  type RosterFolder,
  type RosterFolders,
} from '../../../core/rosterFolders'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { setRosterFolders } from '../../functions'
import { rosterFoldersQuery } from '../../queries'
import { countLabel } from '../../text'

/**
 * The player's folders. Each change applies to the cached document at once, so changes made in quick succession build on
 * each other, then saves the whole document; a failed save reloads what the server holds.
 */
export function useRosterFolders(signedIn: boolean) {
  const queryClient = useQueryClient()
  const { queryKey } = rosterFoldersQuery()
  const folders = useQuery({ ...rosterFoldersQuery(), enabled: signedIn }).data ?? NO_ROSTER_FOLDERS
  const save = useMutation({
    // Each save carries the whole document, so they run in order: a later change must never land before an earlier one.
    scope: { id: 'roster-folders' },
    mutationFn: (next: RosterFolders) => setRosterFolders({ data: next }),
    onError: () => queryClient.invalidateQueries({ queryKey }),
  })
  const apply = (change: (current: RosterFolders) => RosterFolders) => {
    const current = queryClient.getQueryData<RosterFolders>(queryKey) ?? folders
    const next = change(current)
    if (next === current) return
    queryClient.setQueryData(queryKey, next)
    save.mutate(next)
  }
  return {
    folders,
    error: save.error,
    folderOf: (rosterId: string) => folders.filed[rosterId] ?? null,
    /** Creates a folder inside `parentId`, or at the top level, and files `rosterIds` in it in one save. */
    create: (name: string, parentId: string | null, filing?: { rosterIds: readonly string[]; saved: ReadonlySet<string> }) => {
      const id = crypto.randomUUID()
      apply((current) => {
        const created = addRosterFolder(current, { id, name, parentId })
        return filing ? fileRosters(created, filing.rosterIds, id, filing.saved) : created
      })
    },
    rename: (folderId: string, name: string) => apply((current) => renameRosterFolder(current, folderId, name)),
    move: (folderId: string, parentId: string | null) => apply((current) => moveRosterFolder(current, folderId, parentId)),
    remove: (folderId: string) => apply((current) => removeRosterFolder(current, folderId)),
    file: (rosterIds: readonly string[], folderId: string | null, saved: ReadonlySet<string>) =>
      apply((current) => fileRosters(current, rosterIds, folderId, saved)),
  }
}

export type RosterFolderActions = ReturnType<typeof useRosterFolders>

/** Names a new folder, or renames one. */
export function FolderNameDialog({
  open,
  initial = '',
  title,
  action,
  onSave,
  onClose,
}: {
  open: boolean
  initial?: string
  title: string
  action: string
  onSave: (name: string) => void
  onClose: () => void
}) {
  const id = useId()
  const [name, setName] = useState(initial)
  const trimmed = name.trim()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent fit>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            if (!trimmed) return
            onSave(trimmed)
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-2">
            <Label htmlFor={id}>Folder name</Label>
            <Input
              id={id}
              value={name}
              maxLength={ROSTER_FOLDER_NAME_MAX_LENGTH}
              placeholder="Tournament, Trying out, Necrons…"
              onChange={(event) => setName(event.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed}>
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Every folder as a tree to pick a destination from, with the top level first. */
function FolderPicker({
  folders,
  topLabel,
  disabled,
  onPick,
}: {
  folders: readonly RosterFolder[]
  topLabel: string
  disabled: (folderId: string | null) => boolean
  onPick: (folderId: string | null) => void
}) {
  return (
    <>
      <Button variant="ghost" className="justify-start" disabled={disabled(null)} onClick={() => onPick(null)}>
        <Inbox /> {topLabel}
      </Button>
      {folderTree(folders).map(({ folder, depth }) => (
        <Button
          key={folder.id}
          variant="ghost"
          className="justify-start"
          style={{ paddingLeft: `${0.625 + (depth + 1) * 1.25}rem` }}
          disabled={disabled(folder.id)}
          onClick={() => onPick(folder.id)}
        >
          <Folder /> <span className="truncate">{folder.name}</span>
        </Button>
      ))}
    </>
  )
}

/** Files one list, or every selected one, in a folder, in a new folder, or in none. */
export function MoveToFolderDialog({
  rosterIds,
  folders,
  saved,
  onMoved,
  onClose,
}: {
  /** The bases being moved; their variants go with them. */
  rosterIds: readonly string[] | null
  folders: RosterFolderActions
  saved: ReadonlySet<string>
  onMoved?: () => void
  onClose: () => void
}) {
  const [naming, setNaming] = useState(false)
  const ids = rosterIds ?? []
  const current = new Set(ids.map((id) => folders.folderOf(id)))
  const only = current.size === 1 ? [...current][0] : undefined
  const move = (folderId: string | null) => {
    folders.file(ids, folderId, saved)
    onMoved?.()
    onClose()
  }
  return (
    <>
      <Dialog open={Boolean(rosterIds) && !naming} onOpenChange={(next) => !next && onClose()}>
        <DialogContent fit>
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription>
              {ids.length === 1 ? 'Its variants move with it.' : `${countLabel(ids.length, 'roster')}, each with its variants.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-1">
            <FolderPicker folders={folders.folders.folders} topLabel="Not in a folder" disabled={(id) => only === id} onPick={move} />
            <Button variant="ghost" className="justify-start text-parchment" onClick={() => setNaming(true)}>
              <FolderPlus /> New folder…
            </Button>
            {folders.error ? <Problem error={folders.error} /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <FolderNameDialog
        key={String(naming)}
        open={naming}
        title="New folder"
        action="Create and move"
        onSave={(name) => {
          folders.create(name, null, { rosterIds: ids, saved })
          onMoved?.()
        }}
        onClose={() => {
          setNaming(false)
          onClose()
        }}
      />
    </>
  )
}

/** Moves a folder, with everything in it, into another folder or to the top level, never into itself. */
export function MoveFolderDialog({
  folder,
  folders,
  onClose,
}: {
  folder: RosterFolder | null
  folders: RosterFolderActions
  onClose: () => void
}) {
  const all = folders.folders.folders
  const inside = folder ? folderAndInside(all, folder.id) : new Set<string>()
  // A folder whose own depth plus the moved folder's depth would pass the limit cannot take it.
  const height = folder ? Math.max(...[...inside].map((id) => folderPath(all, id).length - folderPath(all, folder.id).length)) + 1 : 0
  const tooDeep = (id: string) => folderPath(all, id).length + 1 + height > ROSTER_FOLDER_DEPTH_MAX
  return (
    <Dialog open={Boolean(folder)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent fit>
        <DialogHeader>
          <DialogTitle>Move {folder?.name}</DialogTitle>
          <DialogDescription>Everything in it moves too.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-1">
          <FolderPicker
            folders={all}
            topLabel="All rosters"
            disabled={(id) => (id === null ? !folder?.parentId : inside.has(id) || id === folder?.parentId || tooDeep(id))}
            onPick={(parentId) => {
              if (folder) folders.move(folder.id, parentId)
              onClose()
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** What a dragged card carries: a list with its variants, one variant on its own, or a folder. */
export const ROSTER_DRAG_TYPE = 'application/x-praetorium-roster'
export const VARIANT_DRAG_TYPE = 'application/x-praetorium-variant'
const FOLDER_DRAG_TYPE = 'application/x-praetorium-folder'
const DRAG_TYPES = { roster: ROSTER_DRAG_TYPE, variant: VARIANT_DRAG_TYPE, folder: FOLDER_DRAG_TYPE } as const

/** A dropped variant names the base it came from, so dropping it back on its own card does nothing. */
export type DroppedItem = { kind: 'roster' | 'folder'; id: string } | { kind: 'variant'; id: string; baseId: string }

/** Makes an element take a dragged item of `kinds`: highlighted while one is over it, and handing it over when dropped. */
function useDrop(onDrop: (item: DroppedItem) => void, kinds: readonly DroppedItem['kind'][]) {
  const [over, setOver] = useState(false)
  const kind = (event: DragEvent) => kinds.find((candidate) => event.dataTransfer.types.includes(DRAG_TYPES[candidate])) ?? null
  return {
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        if (!kind(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        setOver(false)
        const dropped = kind(event)
        if (!dropped) return
        event.preventDefault()
        // A folder inside a tile or a card inside the list would otherwise hand the same drop on to the target around it.
        event.stopPropagation()
        const data = event.dataTransfer.getData(DRAG_TYPES[dropped])
        onDrop(
          dropped === 'variant' ? { kind: dropped, ...(JSON.parse(data) as { id: string; baseId: string }) } : { kind: dropped, id: data },
        )
      },
    },
  }
}

const useFolderDrop = (onDrop: (item: DroppedItem) => void) => useDrop(onDrop, ['roster', 'variant', 'folder'])

/**
 * While a variant is dragged, the whole page takes it except the card it came from: dropped anywhere outside that card,
 * it becomes a roster of its own. Folder targets stop the drop first and file it as well. Returns the base of the variant
 * in the air, so its card can say where outside begins.
 */
export function useVariantDetach(onDetach: (variantId: string) => void) {
  const [dragged, setDragged] = useState<{ id: string; baseId: string } | null>(null)
  const detach = useEffectEvent(onDetach)
  useEffect(() => {
    let current: { id: string; baseId: string } | null = null
    const outside = (event: globalThis.DragEvent) =>
      current !== null &&
      (event.target as Element | null)?.closest?.('[data-roster-group]')?.getAttribute('data-roster-group') !== current.baseId
    const start = (event: globalThis.DragEvent) => {
      const data = event.dataTransfer?.getData(VARIANT_DRAG_TYPE)
      current = data ? (JSON.parse(data) as { id: string; baseId: string }) : null
      setDragged(current)
    }
    const over = (event: globalThis.DragEvent) => {
      if (outside(event)) event.preventDefault()
    }
    const drop = (event: globalThis.DragEvent) => {
      if (outside(event)) {
        event.preventDefault()
        detach(current!.id)
      }
      current = null
      setDragged(null)
    }
    const end = () => {
      current = null
      setDragged(null)
    }
    window.addEventListener('dragstart', start)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', end)
    return () => {
      window.removeEventListener('dragstart', start)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', end)
    }
  }, [])
  return dragged?.baseId ?? null
}

type TileRoster = { id: string; limit: number; catalogueId: string }

/** What can be done to a folder, from its tile or from inside it. */
export type FolderActions = {
  onRename: (folder: RosterFolder) => void
  onMove: (folder: RosterFolder) => void
  onDelete: (folder: RosterFolder) => void
}

/** A folder's actions, in whichever menu asked for them. */
function FolderActionItems({
  Item,
  folder,
  actions,
}: {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem
  folder: RosterFolder
  actions: FolderActions
}) {
  return (
    <>
      <Item onClick={() => actions.onRename(folder)}>
        <Pencil /> Rename folder
      </Item>
      <Item onClick={() => actions.onMove(folder)}>
        <FolderInput /> Move folder…
      </Item>
      <Item variant="destructive" onClick={() => actions.onDelete(folder)}>
        <Trash2 /> Delete folder
      </Item>
    </>
  )
}

/** The folders inside `parentId` as tiles to open, each saying what is in it; a roster or folder dragged onto one goes in. */
export function FolderTiles({
  folders,
  parentId,
  rosters,
  filedIn,
  factionOf,
  onDrop,
  onNew,
  matchesOnly = false,
  actions,
}: {
  folders: readonly RosterFolder[]
  parentId: string | null
  rosters: readonly TileRoster[]
  filedIn: (roster: TileRoster) => string | null
  factionOf: (catalogueId: string) => FactionPresentation | undefined
  onDrop: (item: DroppedItem, folderId: string) => void
  /** Absent where another level of folders would be too deep. */
  onNew?: () => void
  /** While a search or filter is on, `rosters` are its matches and a folder holding none of them hides. */
  matchesOnly?: boolean
  actions: FolderActions
}) {
  const tiles = childFolders(folders, parentId)
    .map((folder) => {
      const inside = folderAndInside(folders, folder.id)
      return { folder, held: rosters.filter((roster) => inside.has(filedIn(roster) ?? '')) }
    })
    .filter(({ held }) => !matchesOnly || held.length)
  if (!tiles.length && !onNew) return null
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 pt-1.5 sm:grid-cols-3">
      {tiles.map(({ folder, held }) => (
        <FolderTile
          key={folder.id}
          folder={folder}
          folders={childFolders(folders, folder.id).length}
          rosters={held}
          factionOf={factionOf}
          onDrop={(item) => onDrop(item, folder.id)}
          actions={actions}
        />
      ))}
      {onNew ? (
        <button
          type="button"
          onClick={onNew}
          className="grid h-24 place-items-center rounded-xl border border-dashed border-runner text-sm font-semibold text-parchment hover:border-parchment hover:bg-raised"
        >
          <span className="flex items-center gap-2">
            <FolderPlus className="size-4" aria-hidden /> New folder
          </span>
        </button>
      ) : null}
    </div>
  )
}

function FolderTile({
  folder,
  folders,
  rosters,
  factionOf,
  onDrop,
  actions,
}: {
  folder: RosterFolder
  /** How many folders are directly inside it. */
  folders: number
  /** Every roster inside it, however deep. */
  rosters: readonly TileRoster[]
  factionOf: (catalogueId: string) => FactionPresentation | undefined
  onDrop: (item: DroppedItem) => void
  actions: FolderActions
}) {
  const drop = useFolderDrop((item) => item.id !== folder.id && onDrop(item))
  const factions = [
    ...new Map(rosters.flatMap((roster) => factionOf(roster.catalogueId) ?? []).map((faction) => [faction.slug, faction])).values(),
  ]
  const limits = rosters.map((roster) => roster.limit)
  const span = limits.length
    ? Math.min(...limits) === Math.max(...limits)
      ? `${Math.min(...limits)}`
      : `${Math.min(...limits)}–${Math.max(...limits)}`
    : null
  return (
    // The menu sits beside the link rather than inside it, since a link cannot hold a button.
    <ContextMenu>
      <ContextMenuTrigger render={<div className="relative" />}>
        <Link
          from="/rosters/"
          to="/rosters"
          // Opening a folder keeps the search and filters, which then reach into it.
          search={(previous) => ({ ...previous, folder: folder.id })}
          {...drop.props}
          onDragStart={(event) => {
            event.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.id)
            event.dataTransfer.effectAllowed = 'copyMove'
          }}
          data-folder={folder.name}
          className={cn(
            // The tab on its top edge is what makes the card read as a folder.
            // Every tile is one height, so a row of folders reads as a grid whatever each holds.
            'part relative flex h-24 flex-col gap-1 p-3 pt-3.5 pr-10 hover:border-runner-hi hover:bg-raised',
            'before:absolute before:-top-1.5 before:left-3 before:h-1.5 before:w-10 before:rounded-t-md before:border before:border-b-0 before:border-edge before:bg-panel',
            // The tab is part of the folder's shape, so it takes every state the body does.
            'hover:before:border-runner-hi hover:before:bg-raised',
            drop.over &&
              'border-parchment bg-raised before:border-parchment before:bg-raised hover:border-parchment hover:before:border-parchment',
          )}
        >
          <span className="flex min-w-0 items-center gap-2 font-bold uppercase">
            <Folder className="size-4 shrink-0 text-dim" aria-hidden />
            <span className="truncate">{folder.name}</span>
          </span>
          <span className="truncate text-xs text-dim">
            {[folders ? countLabel(folders, 'folder') : null, countLabel(rosters.length, 'roster'), span ? `${span} pts` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {factions.length ? (
            <span className="mt-auto flex items-center gap-1">
              {factions.slice(0, 5).map((faction) => (
                <FactionMark key={faction.slug} faction={faction} size="sm" />
              ))}
              {factions.length > 5 ? <span className="text-xs text-faint">+{factions.length - 5}</span> : null}
            </span>
          ) : null}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label={`Actions for ${folder.name}`} />}
          >
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max">
            <FolderActionItems Item={DropdownMenuItem} folder={folder} actions={actions} />
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-max">
        <FolderActionItems Item={ContextMenuItem} folder={folder} actions={actions} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** One step of the path back up: a link that also takes a roster or folder dropped on it. */
function Crumb({ folderId, label, onDrop }: { folderId: string | null; label: string; onDrop: (item: DroppedItem) => void }) {
  const drop = useFolderDrop(onDrop)
  return (
    <>
      <Link
        from="/rosters/"
        to="/rosters"
        search={(previous) => ({ ...previous, folder: folderId ?? undefined })}
        {...drop.props}
        className={cn(
          'min-w-0 truncate rounded-md px-1 text-dim hover:text-bone',
          drop.over && 'outline-2 outline-offset-2 outline-parchment',
        )}
      >
        {label}
      </Link>
      <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
    </>
  )
}

/** Where the player is: every folder from the top down to the open one, with its menu; dropping on a step moves into it. */
export function FolderBreadcrumb({
  folder,
  folders,
  onDrop,
  actions,
}: {
  folder: RosterFolder
  folders: readonly RosterFolder[]
  onDrop: (item: DroppedItem, folderId: string | null) => void
  actions: FolderActions
}) {
  return (
    <nav aria-label="Folder" className="flex min-w-0 items-center gap-1 pb-1 text-sm">
      <Crumb folderId={null} label="All rosters" onDrop={(item) => onDrop(item, null)} />
      {folderPath(folders, folder.id).map((above) => (
        <Crumb key={above.id} folderId={above.id} label={above.name} onDrop={(item) => onDrop(item, above.id)} />
      ))}
      <span className="flex min-w-0 items-center gap-2 px-1 font-bold text-bone uppercase">
        <FolderOpen className="size-4 shrink-0 text-dim" aria-hidden />
        <span className="truncate">{folder.name}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${folder.name}`} />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-max">
          <FolderActionItems Item={DropdownMenuItem} folder={folder} actions={actions} />
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
