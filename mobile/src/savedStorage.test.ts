import { beforeEach, expect, it, vi } from 'vitest'
import type { AppSnapshot } from '../../src/contracts/appSnapshot'

const disk = vi.hoisted(() => ({ files: new Map<string, string>(), fault: '' }))
vi.mock('expo-file-system', () => {
  class Directory {
    uri: string
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/')
    }
    get exists() {
      return [...disk.files.keys()].some((path) => path.startsWith(this.uri + '/'))
    }
    create() {}
    list() {
      return [...disk.files.keys()].filter((path) => path.startsWith(this.uri + '/')).map((path) => new File(path))
    }
    delete() {
      for (const path of disk.files.keys()) if (path.startsWith(this.uri + '/')) disk.files.delete(path)
    }
  }
  class File {
    uri: string
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/')
    }
    get name() {
      return this.uri.split('/').at(-1)!
    }
    get exists() {
      return disk.files.has(this.uri)
    }
    get size() {
      return new TextEncoder().encode(disk.files.get(this.uri) ?? '').byteLength
    }
    write(text: string) {
      disk.files.set(this.uri, disk.fault === 'short' ? text.slice(0, -1) : text)
      if (disk.fault === 'write') throw new Error('Disk full')
    }
    textSync() {
      if (disk.fault === 'read' && this.name.includes('new')) throw new Error('Unreadable')
      return disk.files.get(this.uri)!
    }
    delete() {
      disk.files.delete(this.uri)
    }
    moveSync(destination: File, options?: { overwrite?: boolean }) {
      if (options?.overwrite) disk.files.delete(destination.uri)
      if (disk.fault === 'move') throw new Error('Move failed')
      disk.files.set(destination.uri, disk.files.get(this.uri)!)
      disk.files.delete(this.uri)
      this.uri = destination.uri
    }
  }
  return { Directory, File, Paths: { document: 'documents' } }
})
import { readAppSnapshot, storeAppSnapshot } from './appSnapshotStorage'
import { readOfflineReference, storeOfflineReference } from './offlineReferenceStorage'

const snapshot: AppSnapshot = { version: 1, owner: 'alice', queries: [{ key: ['me'], data: { id: 'alice' }, updatedAt: 1 }] }
const pack = { html: '<!doctype html><script>window.PraetoriumOffline={version:1}</script>', savedAt: 1 }
beforeEach(() => {
  disk.files.clear()
  disk.fault = ''
})

it.each(['short', 'write', 'move'])('keeps the saved snapshot after a %s replacement failure', (fault) => {
  storeAppSnapshot(snapshot, 'old')
  disk.fault = fault
  expect(() =>
    storeAppSnapshot({ ...snapshot, queries: [...snapshot.queries, { key: ['home-rosters'], data: 'new', updatedAt: 2 }] }, 'new'),
  ).toThrow()
  disk.fault = ''
  expect(readAppSnapshot()).toEqual(snapshot)
  expect([...disk.files.keys()].some((path) => path.endsWith('.tmp'))).toBe(false)
})

it.each(['short', 'write'])('keeps the saved reference after a %s replacement failure', (fault) => {
  storeOfflineReference(pack, 'old')
  disk.fault = fault
  expect(() => storeOfflineReference({ ...pack, savedAt: 2 }, 'new')).toThrow()
  disk.fault = ''
  expect(readOfflineReference()).toEqual(pack)
  expect(disk.files.size).toBe(1)
})

it('recovers the previous reference when the newest generation cannot be read', () => {
  storeOfflineReference(pack, 'old')
  storeOfflineReference({ ...pack, savedAt: 2 }, 'new')
  disk.fault = 'read'
  expect(readOfflineReference()).toEqual(pack)
})

it('removes every account snapshot generation on sign-out', () => {
  storeAppSnapshot(snapshot, 'old')
  storeAppSnapshot(snapshot, 'new')
  storeAppSnapshot(null, 'clear')
  expect(readAppSnapshot()).toBeNull()
})

it('keeps each account’s offline work in its own durable partition', async () => {
  const { readLocalState, storeLocalState } = await import('./localStateStorage')
  const { emptyLocalState } = await import('../../src/contracts/localState')
  const alice = readLocalState('alice')
  storeLocalState(
    'alice',
    { ...emptyLocalState('alice'), documents: { private: { data: 'Alice’s army', serverVersion: null } } },
    alice.epoch,
    0,
    'alice',
  )
  expect(readLocalState('bob').state).toBeNull()
  expect(readLocalState('alice').state?.documents.private?.data).toBe('Alice’s army')
})
it('rejects a stale native writer after another window saves', async () => {
  const { readLocalState, storeLocalState } = await import('./localStateStorage')
  const { emptyLocalState } = await import('../../src/contracts/localState')
  const saved = readLocalState('alice')
  storeLocalState('alice', { ...emptyLocalState('alice'), revision: 1 }, saved.epoch, 0, 'first')
  expect(storeLocalState('alice', emptyLocalState('alice'), saved.epoch, 0, 'second').saved).toBe(false)
})
it('keeps the last durable edit after a native write fails', async () => {
  const { readLocalState, storeLocalState } = await import('./localStateStorage')
  const { emptyLocalState } = await import('../../src/contracts/localState')
  const saved = readLocalState('alice')
  const first = { ...emptyLocalState('alice'), revision: 1 }
  storeLocalState('alice', first, saved.epoch, 0, 'first')
  disk.fault = 'move'
  expect(() => storeLocalState('alice', { ...first, revision: 2 }, saved.epoch, 1, 'second')).toThrow()
  disk.fault = ''
  expect(readLocalState('alice').state).toEqual(first)
})
it('prevents a late native save from resurrecting cleared work', async () => {
  const { readLocalState, storeLocalState } = await import('./localStateStorage')
  const { emptyLocalState } = await import('../../src/contracts/localState')
  const saved = readLocalState('alice')
  storeLocalState('alice', null, saved.epoch, 0, 'clear')
  expect(storeLocalState('alice', emptyLocalState('alice'), saved.epoch, 0, 'late').saved).toBe(false)
})
