import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { CATALOGUE_HISTORY_FORMAT, CATALOGUE_HISTORY_LIMIT, type CatalogueHistoryEntry } from '../core/catalogueHistory'
import { CATALOGUE_HISTORY_FILE, loadCatalogueHistory, MAX_CATALOGUE_HISTORY_BYTES } from './catalogueHistory'
import { distributableCatalogueFile } from './catalogueSnapshot'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const entry = (from: string, recordedAt: number): CatalogueHistoryEntry => ({
  from,
  revisions: { definitions: `${from}-next` },
  recordedAt,
  changes: {
    factions: [{ catalogueId: 'orks', faction: 'Orks', changes: [{ kind: 'datasheet-removed', id: 'lootas', name: 'Lootas' }] }],
    omitted: 0,
  },
})

function catalogueWith(contents?: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-history-'))
  directories.push(directory)
  if (contents !== undefined) {
    fs.mkdirSync(path.join(directory, path.dirname(CATALOGUE_HISTORY_FILE)), { recursive: true })
    fs.writeFileSync(path.join(directory, CATALOGUE_HISTORY_FILE), contents)
  }
  return directory
}

const refused = () => vi.spyOn(console, 'error').mockImplementation(() => {})

it('reads a history oldest first', () => {
  const history = JSON.stringify({ format: CATALOGUE_HISTORY_FORMAT, entries: [entry('b', 20), entry('a', 10)] })

  expect(loadCatalogueHistory(catalogueWith(history))?.map((known) => known.from)).toEqual(['a', 'b'])
})

it('reads a catalogue without a history as having none', () => {
  expect(loadCatalogueHistory(catalogueWith())).toBeNull()
})

it('refuses a history that does not validate', () => {
  refused()

  expect(loadCatalogueHistory(catalogueWith(JSON.stringify({ format: CATALOGUE_HISTORY_FORMAT, entries: [{ from: 'a' }] })))).toBeNull()
})

it('refuses a history of another format', () => {
  refused()

  expect(loadCatalogueHistory(catalogueWith(JSON.stringify({ format: 'praetorium.catalogue-history.v0', entries: [] })))).toBeNull()
})

it('refuses a history holding more entries than its bound', () => {
  refused()
  const entries = Array.from({ length: CATALOGUE_HISTORY_LIMIT + 1 }, (_, at) => entry(`s${at}`, at))

  expect(loadCatalogueHistory(catalogueWith(JSON.stringify({ format: CATALOGUE_HISTORY_FORMAT, entries })))).toBeNull()
})

it('refuses a history file past its size bound without reading it', () => {
  refused()

  expect(loadCatalogueHistory(catalogueWith(' '.repeat(MAX_CATALOGUE_HISTORY_BYTES + 1)))).toBeNull()
})

it('packs the history into a snapshot with everything else', () => {
  expect(distributableCatalogueFile(CATALOGUE_HISTORY_FILE)).toBe(true)
})
