import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChangeSource } from '../core/catalogueChanges'
import { loadSnapshot, recordSwap, snapshotOf } from './catalogueChanges'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

const snapshotId = (digit: string) => digit.repeat(64)

/** Points an installed-snapshot directory at a snapshot id, as an install leaves it. */
function install(directory: string, id: string) {
  fs.mkdirSync(path.join(directory, 'definitions'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'definitions', 'book.json'), '{}')
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'revision' }))
  fs.writeFileSync(
    path.join(directory, '.snapshot-manifest.json'),
    JSON.stringify({ format: 'praetorium.catalogue.v3', revisions: {}, sources: ['definitions'], files: {} }),
  )
  fs.writeFileSync(
    path.join(directory, '.snapshot.json'),
    JSON.stringify({ format: 'praetorium.catalogue-pointer.v1', id, archiveSha256: snapshotId('f') }),
  )
}

function installed(id: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-changes-'))
  directories.push(directory)
  install(directory, id)
  return directory
}

const reference = (points: number): ChangeSource => ({
  datasheets: [],
  detachments: [
    { catalogueId: 'marines', faction: 'Space Marines', id: 'gladius', name: 'Gladius Task Force', points, enhancements: [], upgrades: [] },
  ],
})

const loadedFrom = (id: string, source: ChangeSource) => loadSnapshot(installed(id), () => source)

function recorder() {
  const recorded: unknown[] = []
  return { recorded, record: async (input: unknown) => void recorded.push(input) }
}

describe('reading a snapshot', () => {
  it('remembers which snapshot a load read', () => {
    expect(snapshotOf(loadedFrom(snapshotId('a'), reference(1)))).toBe(snapshotId('a'))
  })

  it('attributes nothing to a load the next snapshot arrived during', () => {
    const directory = installed(snapshotId('a'))

    const value = loadSnapshot(directory, () => {
      install(directory, snapshotId('b'))
      return reference(1)
    })

    expect(snapshotOf(value)).toBeNull()
  })

  it('attributes nothing to a value built from data another snapshot supplied', () => {
    const catalogue = loadedFrom(snapshotId('a'), reference(1))

    expect(
      snapshotOf(
        loadSnapshot(
          installed(snapshotId('b')),
          () => reference(1),
          () => catalogue,
        ),
      ),
    ).toBeNull()
  })

  it('attributes nothing when no snapshot is installed', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-changes-'))
    directories.push(directory)

    expect(snapshotOf(loadSnapshot(directory, () => reference(1)))).toBeNull()
  })
})

describe('recording a swap', () => {
  it('records what changed between the outgoing and incoming snapshots', async () => {
    const { recorded, record } = recorder()

    await recordSwap(loadedFrom(snapshotId('a'), reference(1)), loadedFrom(snapshotId('b'), reference(2)), record)

    expect(recorded).toMatchObject([
      {
        fromSnapshot: snapshotId('a'),
        toSnapshot: snapshotId('b'),
        changes: { factions: [{ catalogueId: 'marines', changes: [{ kind: 'detachment-points', from: '1', to: '2' }] }] },
      },
    ])
  })

  it('records nothing on a first install, with no outgoing data', async () => {
    const { recorded, record } = recorder()

    await recordSwap(null, loadedFrom(snapshotId('b'), reference(2)), record)

    expect(recorded).toEqual([])
  })

  it('records nothing when the incoming data failed to load', async () => {
    const { recorded, record } = recorder()

    await recordSwap(loadedFrom(snapshotId('a'), reference(1)), null, record)

    expect(recorded).toEqual([])
  })

  it('records nothing for incoming data it cannot attribute to a snapshot', async () => {
    const { recorded, record } = recorder()

    await recordSwap(loadedFrom(snapshotId('a'), reference(1)), reference(2), record)

    expect(recorded).toEqual([])
  })

  it('records nothing when the instance reloaded the snapshot it already had', async () => {
    const { recorded, record } = recorder()

    await recordSwap(loadedFrom(snapshotId('a'), reference(1)), loadedFrom(snapshotId('a'), reference(2)), record)

    expect(recorded).toEqual([])
  })

  it('records nothing for an update that changed nothing a player pays for', async () => {
    const { recorded, record } = recorder()

    await recordSwap(loadedFrom(snapshotId('a'), reference(1)), loadedFrom(snapshotId('b'), reference(1)), record)

    expect(recorded).toEqual([])
  })
})
