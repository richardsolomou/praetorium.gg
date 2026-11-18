import { z } from 'zod'
import { byId } from './collections'

export const ROSTER_FOLDER_NAME_MAX_LENGTH = 40
export const ROSTER_FOLDERS_MAX = 50
/** How many folders deep a folder may sit, counting the top level as one. */
export const ROSTER_FOLDER_DEPTH_MAX = 5
const FILED_ROSTERS_MAX = 2_000
const id = z.string().min(1).max(64)
const folderName = z.string().trim().min(1).max(ROSTER_FOLDER_NAME_MAX_LENGTH)

type Folder = { id: string; name: string; parentId: string | null }

/** A folder's ancestors from the top level down, or null when its parents loop or run deeper than folders may go. */
function ancestry(folders: readonly Folder[], folderId: string): Folder[] | null {
  const folderById = byId(folders)
  const path: Folder[] = []
  for (let current = folderById.get(folderId)?.parentId; current; current = folderById.get(current)?.parentId) {
    const parent = folderById.get(current)
    if (!parent || path.length >= ROSTER_FOLDER_DEPTH_MAX) return null
    path.unshift(parent)
  }
  return path
}

/**
 * A player's roster folders, in the order the library shows them, and the folder each filed list is in. A folder with no
 * parent is at the top level. A list is in at most one folder; a variant goes where its base does, so only bases are filed.
 */
export const rosterFoldersSchema = z
  .strictObject({
    folders: z.array(z.strictObject({ id, name: folderName, parentId: id.nullable() })).max(ROSTER_FOLDERS_MAX),
    filed: z.record(id, id).refine((filed) => Object.keys(filed).length <= FILED_ROSTERS_MAX, 'too many filed rosters'),
  })
  .refine(
    ({ folders, filed }) =>
      new Set(folders.map((folder) => folder.id)).size === folders.length &&
      Object.values(filed).every((folderId) => folders.some((folder) => folder.id === folderId)),
    'a list is filed in a folder that does not exist',
  )
  .refine(
    ({ folders }) => folders.every((folder) => (ancestry(folders, folder.id)?.length ?? Infinity) < ROSTER_FOLDER_DEPTH_MAX),
    'a folder is inside itself, inside a folder that does not exist, or too deep',
  )

export type RosterFolders = z.infer<typeof rosterFoldersSchema>
export type RosterFolder = RosterFolders['folders'][number]

export const NO_ROSTER_FOLDERS: RosterFolders = { folders: [], filed: {} }

/** The folders above `folderId`, from the top level down. */
export const folderPath = (folders: readonly RosterFolder[], folderId: string) => ancestry(folders, folderId) ?? []

/** The folders directly inside `parentId`, or at the top level when it is null. */
export const childFolders = (folders: readonly RosterFolder[], parentId: string | null) =>
  folders.filter((folder) => folder.parentId === parentId)

/** `folderId` and every folder inside it, however deep. */
export function folderAndInside(folders: readonly RosterFolder[], folderId: string): Set<string> {
  const inside = new Set([folderId])
  for (let grew = true; grew;) {
    grew = false
    for (const folder of folders)
      if (folder.parentId && inside.has(folder.parentId) && !inside.has(folder.id)) {
        inside.add(folder.id)
        grew = true
      }
  }
  return inside
}

/** Every folder in the order a tree reads, each with how deep it sits. */
export function folderTree(folders: readonly RosterFolder[]) {
  const walk = (parentId: string | null, depth: number): { folder: RosterFolder; depth: number }[] =>
    childFolders(folders, parentId).flatMap((folder) => [{ folder, depth }, ...walk(folder.id, depth + 1)])
  return walk(null, 0)
}

function addRosterFolder(current: RosterFolders, folder: RosterFolder): RosterFolders {
  return current.folders.some((existing) => existing.id === folder.id) ? current : { ...current, folders: [...current.folders, folder] }
}

function renameRosterFolder(current: RosterFolders, folderId: string, name: string): RosterFolders {
  return { ...current, folders: current.folders.map((folder) => (folder.id === folderId ? { ...folder, name } : folder)) }
}

function moveRosterFolder(current: RosterFolders, folderId: string, parentId: string | null): RosterFolders {
  return { ...current, folders: current.folders.map((folder) => (folder.id === folderId ? { ...folder, parentId } : folder)) }
}

/** Deletes a folder and every folder inside it; the lists filed anywhere inside move up to the folder it was in. */
function removeRosterFolder(current: RosterFolders, folderId: string): RosterFolders {
  const parentId = current.folders.find((folder) => folder.id === folderId)?.parentId ?? null
  const removed = folderAndInside(current.folders, folderId)
  return {
    folders: current.folders.filter((folder) => !removed.has(folder.id)),
    filed: Object.fromEntries(
      Object.entries(current.filed).flatMap(([rosterId, filedIn]) =>
        !removed.has(filedIn) ? [[rosterId, filedIn]] : parentId ? [[rosterId, parentId]] : [],
      ),
    ),
  }
}

function fileRosters(current: RosterFolders, rosterIds: readonly string[], folderId: string | null): RosterFolders {
  const filed = { ...current.filed }
  for (const rosterId of rosterIds) {
    if (folderId) filed[rosterId] = folderId
    else delete filed[rosterId]
  }
  return { ...current, filed }
}

const rosterIds = z.array(id).min(1).max(100)

/** One change a player makes to their folders, saved on its own so it applies to whatever the server holds by then. */
export const rosterFolderChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('add'), id, name: folderName, parentId: id.nullable(), rosterIds: rosterIds.optional() }),
  z.strictObject({ kind: z.literal('rename'), id, name: folderName }),
  z.strictObject({ kind: z.literal('move'), id, parentId: id.nullable() }),
  z.strictObject({ kind: z.literal('remove'), id }),
  z.strictObject({ kind: z.literal('file'), rosterIds, folderId: id.nullable() }),
])

export type RosterFolderChange = z.infer<typeof rosterFolderChangeSchema>

/**
 * Applies one change. A change that would break the document, such as moving a folder into itself, going too deep or
 * filing in a folder another device deleted, changes nothing. With `groups`, the variant groups the player still has,
 * filings for deleted lists are dropped as it goes.
 */
export function applyRosterFolderChange(current: RosterFolders, change: RosterFolderChange, groups?: ReadonlySet<string>): RosterFolders {
  const changed =
    change.kind === 'add'
      ? fileRosters(
          addRosterFolder(current, { id: change.id, name: change.name, parentId: change.parentId }),
          change.rosterIds ?? [],
          change.id,
        )
      : change.kind === 'rename'
        ? renameRosterFolder(current, change.id, change.name)
        : change.kind === 'move'
          ? moveRosterFolder(current, change.id, change.parentId)
          : change.kind === 'remove'
            ? removeRosterFolder(current, change.id)
            : fileRosters(current, change.rosterIds, change.folderId)
  const next = groups
    ? { ...changed, filed: Object.fromEntries(Object.entries(changed.filed).filter(([group]) => groups.has(group))) }
    : changed
  return rosterFoldersSchema.safeParse(next).success ? next : current
}
