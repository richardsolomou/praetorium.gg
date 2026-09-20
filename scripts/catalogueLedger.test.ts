import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { CanonicalCatalogue } from '../src/contracts/catalogue'
import { writeCatalogueLedger } from './catalogueLedger'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function fixture(): CanonicalCatalogue {
  return {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: { definitions: 'definitions-revision', datacards: 'datacards-revision' },
    datasheets: [
      {
        catalogueId: 'faction-1',
        faction: 'Test Faction',
        attribution: null,
        id: 'datasheet-1',
        slug: 'test-unit',
        referenceRoute: null,
        name: 'Test Unit',
        points: 100,
        keywords: [],
        profiles: [],
        abilities: [],
        composition: [],
        loadout: null,
        wargearOptions: [],
        baseSize: null,
        transport: null,
        costs: [],
        attachments: [],
        leaders: [],
        supporters: [],
        keywordRules: [],
        provenance: {
          definitions: { revision: 'definitions-revision', entryId: 'datasheet-1' },
          datacards: null,
          rules: null,
          fields: {
            identity: { sources: ['definitions'], strategy: 'single-source' },
            points: { sources: ['definitions'], strategy: 'single-source' },
            keywords: { sources: ['definitions'], strategy: 'single-source' },
            profiles: { sources: ['definitions'], strategy: 'single-source' },
            abilities: { sources: ['definitions'], strategy: 'single-source' },
            composition: { sources: [], strategy: 'unresolved' },
            loadout: { sources: [], strategy: 'unresolved' },
            wargear: { sources: ['definitions'], strategy: 'fallback' },
            baseSize: { sources: [], strategy: 'unresolved' },
            transport: { sources: [], strategy: 'unresolved' },
            costs: { sources: [], strategy: 'unresolved' },
            relationships: { sources: ['definitions'], strategy: 'single-source' },
          },
        },
      },
    ],
    ruleDocuments: [
      {
        id: 'core-rules',
        slug: 'core-rules',
        title: 'Core Rules',
        updated: null,
        sections: [],
        provenance: { datacards: { revision: 'datacards-revision' } },
      },
    ],
    issues: [
      {
        kind: 'missing-source-record',
        severity: 'warning',
        catalogueId: 'faction-1',
        entryId: 'datasheet-1',
        path: '/provenance/datacards',
        message: 'Test Unit has no matching record',
      },
    ],
  }
}

function temporaryLedger() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-catalogue-ledger-'))
  roots.push(root)
  return path.join(root, 'generated')
}

function filesUnder(directory: string, relative = ''): string[] {
  return fs
    .readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const name = path.posix.join(relative, entry.name)
      return entry.isDirectory() ? filesUnder(directory, name) : [name]
    })
    .toSorted()
}

it('shards canonical records by stable source identifiers', () => {
  const directory = temporaryLedger()

  writeCatalogueLedger(fixture(), directory)

  expect(filesUnder(directory)).toEqual([
    'audit/issues.json',
    'audit/summary.json',
    'factions/faction-1/datasheets/datasheet-1.json',
    'factions/faction-1/faction.json',
    'manifest.json',
    'rules/core-rules.json',
  ])
})

it('removes records that disappeared from the canonical catalogue', () => {
  const directory = temporaryLedger()
  fs.mkdirSync(path.join(directory, 'factions', 'old', 'datasheets'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'factions', 'old', 'datasheets', 'removed.json'), '{}\n')

  writeCatalogueLedger(fixture(), directory)

  expect(fs.existsSync(path.join(directory, 'factions', 'old'))).toBe(false)
})

it('writes identical bytes for the same canonical catalogue', () => {
  const first = temporaryLedger()
  const second = temporaryLedger()

  writeCatalogueLedger(fixture(), first)
  writeCatalogueLedger(fixture(), second)

  expect(filesUnder(first).map((name) => [name, fs.readFileSync(path.join(first, name), 'utf8')])).toEqual(
    filesUnder(second).map((name) => [name, fs.readFileSync(path.join(second, name), 'utf8')]),
  )
})

it('records the compiler revision that produced the catalogue', () => {
  const directory = temporaryLedger()

  writeCatalogueLedger(fixture(), directory, {
    repository: 'richardsolomou/praetorium.gg',
    commit: '0123456789abcdef0123456789abcdef01234567',
  })

  expect(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')).compiler).toEqual({
    repository: 'richardsolomou/praetorium.gg',
    commit: '0123456789abcdef0123456789abcdef01234567',
  })
})

it('refuses to replace a home directory', () => {
  expect(() => writeCatalogueLedger(fixture(), os.homedir())).toThrow(/unsafe catalogue ledger directory/)
})

it('rejects an identifier that could escape its shard directory', () => {
  const catalogue = fixture()
  catalogue.datasheets[0]!.id = '../outside'

  expect(() => writeCatalogueLedger(catalogue, temporaryLedger())).toThrow(/not path-safe/)
})

it('rejects an incomplete compiler revision', () => {
  expect(() => writeCatalogueLedger(fixture(), temporaryLedger(), { repository: 'richardsolomou/praetorium.gg', commit: '' })).toThrow(
    /compiler commit/,
  )
})
