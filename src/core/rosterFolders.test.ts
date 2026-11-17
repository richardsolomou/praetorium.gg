import { expect, it } from 'vitest'
import { applyRosterFolderChange, rosterFoldersSchema, type RosterFolders } from './rosterFolders'

const nested: RosterFolders = {
  folders: [
    { id: 'events', name: 'Events', parentId: null },
    { id: 'gt', name: 'GT', parentId: 'events' },
    { id: 'rtt', name: 'RTT', parentId: 'gt' },
  ],
  filed: { necrons: 'gt' },
}

it('refuses to move a folder inside one of its own folders', () => {
  expect(applyRosterFolderChange(nested, { kind: 'move', id: 'events', parentId: 'rtt' })).toBe(nested)
})

it('refuses a saved document whose folders loop', () => {
  const looped = { ...nested, folders: nested.folders.map((folder) => (folder.id === 'events' ? { ...folder, parentId: 'rtt' } : folder)) }
  expect(rosterFoldersSchema.safeParse(looped).success).toBe(false)
})

it('deletes the folders inside a deleted folder and moves their lists up to the folder it was in', () => {
  expect(applyRosterFolderChange({ ...nested, filed: { necrons: 'rtt' } }, { kind: 'remove', id: 'gt' })).toEqual({
    folders: [{ id: 'events', name: 'Events', parentId: null }],
    filed: { necrons: 'events' },
  })
})

it('files nothing in a folder another device deleted', () => {
  expect(applyRosterFolderChange(nested, { kind: 'file', rosterIds: ['orks'], folderId: 'deleted' })).toBe(nested)
})

it('adds a folder to the folders already saved rather than replacing them', () => {
  expect(applyRosterFolderChange(nested, { kind: 'add', id: 'kotc', name: 'KotC', parentId: null }).folders).toHaveLength(4)
})

it('drops the filings of lists the player no longer has', () => {
  expect(applyRosterFolderChange(nested, { kind: 'file', rosterIds: ['orks'], folderId: 'events' }, new Set(['orks'])).filed).toEqual({
    orks: 'events',
  })
})
