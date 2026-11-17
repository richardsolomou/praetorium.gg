import { expect, it } from 'vitest'
import { fileRosters, moveRosterFolder, removeRosterFolder, rosterFoldersSchema, type RosterFolders } from './rosterFolders'

const nested: RosterFolders = {
  folders: [
    { id: 'events', name: 'Events', parentId: null },
    { id: 'gt', name: 'GT', parentId: 'events' },
    { id: 'rtt', name: 'RTT', parentId: 'gt' },
  ],
  filed: { necrons: 'gt' },
}

it('refuses to move a folder inside one of its own folders', () => {
  expect(moveRosterFolder(nested, 'events', 'rtt')).toBe(nested)
})

it('refuses a saved document whose folders loop', () => {
  const looped = { ...nested, folders: nested.folders.map((folder) => (folder.id === 'events' ? { ...folder, parentId: 'rtt' } : folder)) }
  expect(rosterFoldersSchema.safeParse(looped).success).toBe(false)
})

it('moves a deleted folder’s folders and lists up to the folder it was in', () => {
  expect(removeRosterFolder(nested, 'gt')).toEqual({
    folders: [
      { id: 'events', name: 'Events', parentId: null },
      { id: 'rtt', name: 'RTT', parentId: 'events' },
    ],
    filed: { necrons: 'events' },
  })
})

it('reads a document saved before folders could nest as top-level folders', () => {
  expect(rosterFoldersSchema.safeParse({ folders: [{ id: 'kotc', name: 'KotC' }], filed: {} }).success).toBe(true)
})

it('keeps every filing when the library has not loaded its lists yet', () => {
  expect(fileRosters(nested, ['orks'], 'events', new Set()).filed).toEqual({ necrons: 'gt', orks: 'events' })
})
