import fs from 'node:fs'
import { wordsFrom } from '../../src/server/sourceTexts.fixtures'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalogueSources } from '../../src/server/catalogueSources'
import { catalogueCompositionSchema } from '../../src/server/catalogueComposition'
import { catalogueEditionLoaders } from '../../src/server/catalogueEditions'
import { loadCatalogue } from '../../src/server/catalogueIndex'
import { system, points } from '../../src/server/catalogue.fixtures'
import { materializeCatalogue } from './catalogueMaterialize'
import { calculateRosterPrice } from '../../src/shared/pricing'
import { packCatalogueSnapshot, installSnapshotArchive } from '../../src/server/catalogueSnapshot'
import { compiledChangeSource } from './catalogueHistoryCompile'
import { cachedRosterPrice, cachedRosterTotalsFor, cachedRosterAssessmentsFor } from '../../src/server/rosterPrices'
import { catalogueChanges } from '../../src/core/catalogueChanges'
import { CANONICAL_CATALOGUE_SOURCE_NAMES } from '../../src/server/canonicalCatalogueSources'

const reads = vi.hoisted(() => ({ factionIndexFor: vi.fn(), catalogueFor: vi.fn(), rulesFor: vi.fn() }))
vi.mock('../../src/server/app', () => ({ app: () => reads }))

let root: string
const disabled = new Set(['icons', 'battlemaster'] as const)
const pin = 'a'.repeat(40)
const book = (name: string, cost: number, detachment: string) =>
  JSON.stringify({
    catalogue: {
      id: 'cat',
      name,
      gameSystemId: 'gs',
      selectionEntries: [
        {
          id: 'detachments',
          name: 'Detachments',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'detachment-options',
              selectionEntries: [{ id: detachment, name: detachment, type: 'upgrade', costs: [{ typeId: 'dp', name: 'DP', value: 1 }] }],
            },
          ],
        },
      ],
      sharedSelectionEntries: [{ id: 'guard', name: 'Guard', type: 'unit', costs: points(cost) }],
      entryLinks: [{ id: 'guard-offer', targetId: 'guard', type: 'selectionEntry' }],
    },
  })
const archive = (files: Record<string, string>) =>
  new Response(
    zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [`repository/${name}`, new TextEncoder().encode(value)]))),
  )
const composition = () =>
  catalogueCompositionSchema.parse({
    format: 'praetorium.catalogue-composition.v1',
    overlays: [
      { source: 'definitions', ...catalogueSources.definitions, repository: 'BSData/branch', revision: pin, files: ['Marines.json'] },
    ],
    editions: [
      {
        edition: {
          id: 'custodes-codex',
          name: 'Custodes codex',
          status: 'preview',
          default: false,
          catalogueIds: ['cat'],
          releases: [{ at: 1, status: 'preview' }],
        },
        sources: {},
        overlays: [
          {
            source: 'definitions',
            ...catalogueSources.definitions,
            repository: 'praetorium/custom',
            revision: pin,
            files: ['Marines.json'],
          },
        ],
      },
    ],
  })

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-composition-'))
  // Retained editions come from the private store, which signs every request before the stubbed fetch sees it.
  vi.stubEnv('R2_ACCOUNT_ID', 'a'.repeat(32))
  vi.stubEnv('R2_ACCESS_KEY_ID', 'key')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const target = String(url)
      if (target.includes('/BSData/branch/')) return archive({ 'Marines.json': book('Custodes', 110, 'released-detachment') })
      if (target.includes('/praetorium/custom/')) return archive({ 'Marines.json': book('Custodes', 120, 'codex-detachment') })
      if (target.includes(`/${catalogueSources.definitions.repository}/`))
        return archive({
          'Marines.json': book('Custodes', 100, 'old-detachment'),
          'System.json': JSON.stringify({
            gameSystem: { ...system.gameSystem, costTypes: [...system.gameSystem!.costTypes!, { id: 'dp', name: 'DP' }] },
          }),
        })
      if (target.includes(`/${catalogueSources.points.repository}/`))
        return archive({ 'data/empty.yaml': 'faction: Unknown\nslug: unknown\nversion: test\nunits: []\n' })
      return archive({ '11th/gdc/core.json': '{}' })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  fs.rmSync(root, { recursive: true, force: true })
})

async function materialize(manifest = composition()) {
  const directory = path.join(root, 'data')
  await materializeCatalogue(directory, catalogueSources, { disabled, composition: manifest, patchesDirectory: path.join(root, 'patches') })
  return directory
}

it('composes pinned branch files while preserving the shared game system', async () => {
  const directory = await materialize()
  expect(
    loadCatalogue(directory)
      ?.detachments.get('cat')
      ?.options.map((option) => option.id),
  ).toEqual(['released-detachment'])
  expect(loadCatalogue(directory)?.index.pointsTypeId).toBe('cost-pts')
})

it('names the root rules without copying an edition and includes them in history', async () => {
  const manifest = composition()
  manifest.editions[0]!.base = true
  manifest.editions[0]!.overlays = []
  const directory = await materialize(manifest)
  const versions = catalogueEditionLoaders(
    directory,
    () => loadCatalogue(directory),
    () => null,
  )
  expect({
    points: versions.catalogueFor('custodes-codex~cat')!.index.definitions.get('guard')!.costs![0]!.value,
    copied: fs.existsSync(path.join(directory, 'editions')),
    history: compiledChangeSource(directory, CANONICAL_CATALOGUE_SOURCE_NAMES)!.datasheets.some(
      (sheet) => sheet.catalogueId === 'custodes-codex~cat',
    ),
  }).toEqual({ points: 110, copied: false, history: true })
})

async function retainedSnapshot() {
  const manifest = composition()
  manifest.editions = []
  const directory = await materialize(manifest)
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  for (const name of ['battlemaster', 'icons'] as const) {
    revisions[name] = catalogueSources[name].revision
    const file = path.join(directory, name, name === 'battlemaster' ? 'layouts/test.json' : 'test.svg')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, name === 'battlemaster' ? '{}' : '<svg/>')
  }
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify(revisions))
  const archiveFile = path.join(root, 'historical.zip')
  const pointer = packCatalogueSnapshot(directory, archiveFile, path.join(root, 'historical.pointer.json'))
  const original = fetch
  vi.stubGlobal('fetch', (url: string | URL) =>
    String(url).includes(`/snapshots/${pointer.id}.zip`) ? Promise.resolve(new Response(fs.readFileSync(archiveFile))) : original(url),
  )
  const next = composition()
  next.editions[0]!.snapshot = pointer
  next.editions[0]!.overlays = []
  return next
}

it('keeps historical detachment identities and points instead of inheriting current overlays', async () => {
  const manifest = await retainedSnapshot()
  manifest.overlays[0]!.repository = 'praetorium/custom'
  const directory = await materialize(manifest)
  const versions = catalogueEditionLoaders(
    directory,
    () => loadCatalogue(directory),
    () => null,
  )
  const historical = versions.catalogueFor('custodes-codex~cat')!
  expect({
    current: loadCatalogue(directory)!.index.definitions.get('guard')!.costs![0]!.value,
    previous: historical.index.definitions.get('guard')!.costs![0]!.value,
    detachments: historical.detachments.get('custodes-codex~cat')!.options.map((option) => option.id),
  }).toEqual({ current: 120, previous: 110, detachments: ['released-detachment'] })
})

it('refuses a retained edition with a mismatched archive checksum without replacing existing data', async () => {
  const manifest = await retainedSnapshot()
  manifest.editions[0]!.snapshot!.archiveSha256 = '0'.repeat(64)
  await expect(materialize(manifest)).rejects.toThrow('archive checksum does not match')
  expect(loadCatalogue(path.join(root, 'data'))!.index.definitions.get('guard')!.costs![0]!.value).toBe(110)
})

it('checks source withdrawals before reusing a cached historical edition', async () => {
  const manifest = await retainedSnapshot()
  const previous = await materialize(manifest)
  vi.stubEnv('CATALOGUE_DISABLED_SOURCES', 'definitions')

  await expect(
    materializeCatalogue(path.join(root, 'next'), catalogueSources, {
      disabled,
      composition: manifest,
      retainedDirectory: previous,
      patchesDirectory: path.join(root, 'patches'),
    }),
  ).rejects.toThrow('catalogue source definitions has been revoked')
})

it('refuses a historical snapshot that does not contain its declared playable faction', async () => {
  const manifest = await retainedSnapshot()
  manifest.editions[0]!.edition.catalogueIds = ['missing']
  await expect(materialize(manifest)).rejects.toThrow('missing')
})

it('keeps codex-only detachments and prices inside the preview index', async () => {
  const directory = await materialize()
  const base = loadCatalogue(directory)!
  const versions = catalogueEditionLoaders(
    directory,
    () => base,
    () => null,
  )
  const preview = versions.catalogueFor('custodes-codex~cat')!
  const price = (id: string) =>
    calculateRosterPrice(
      { catalogueId: id, detachmentIds: [], disposition: null, limit: 2000, units: [{ entryId: 'guard-offer', models: 1 }] },
      versions.catalogueFor(id),
      null,
    )?.points
  expect({
    current: base.detachments.get('cat')?.options.map((option) => option.id),
    preview: preview.detachments.get('custodes-codex~cat')?.options.map((option) => option.id),
    currentPoints: price('cat'),
    previewPoints: price('custodes-codex~cat'),
  }).toEqual({ current: ['released-detachment'], preview: ['codex-detachment'], currentPoints: 110, previewPoints: 120 })
})

it('never falls back to current data for an unknown preview', async () => {
  const directory = await materialize()
  expect(
    catalogueEditionLoaders(
      directory,
      () => loadCatalogue(directory),
      () => null,
    ).catalogueFor('unknown~cat'),
  ).toBeNull()
})

it('keeps explicitly pinned preview points and army-rule text out of the released data', async () => {
  const original = fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      if (String(url).includes('/preview/points/'))
        return archive({
          'data/custodes.yaml':
            'slug: custodes\nversion: preview\nunits:\n  - name: Guard\n    pricing:\n      - range: "[1,)"\n        costs:\n          - models: 1\n            points: 135\n',
        })
      if (String(url).includes('/preview/cards/'))
        return archive({
          '11th/gdc/Custodes.json': JSON.stringify({
            name: 'Custodes',
            datasheets: [],
            detachments: [],
            rules: {
              army: [{ name: { en: 'Test army rule' }, rules: [{ order: 1, type: 'text', text: { en: 'Preview-only rule text.' } }] }],
            },
          }),
        })
      return original(url)
    }),
  )
  const manifest = composition()
  manifest.editions[0]!.sources = {
    points: { ...catalogueSources.points, repository: 'preview/points', revision: pin },
    datacards: { ...catalogueSources.datacards, repository: 'preview/cards', revision: pin },
  }
  const directory = await materialize(manifest)
  const versions = catalogueEditionLoaders(
    directory,
    () => loadCatalogue(directory),
    () => null,
  )
  const current = versions.catalogueFor('cat')!
  const preview = versions.catalogueFor('custodes-codex~cat')!
  const price = (loaded: typeof current, id: string) =>
    calculateRosterPrice(
      { catalogueId: id, detachmentIds: [], disposition: null, limit: 2000, units: [{ entryId: 'guard-offer', models: 1 }] },
      loaded,
      null,
    )?.points
  expect({
    currentPoints: price(current, 'cat'),
    previewPoints: price(preview, 'custodes-codex~cat'),
    currentText: current.datacards.armyRules.get('test-army-rule'),
    previewText: wordsFrom(directory)(preview.datacards.armyRules.get('test-army-rule') ?? ''),
  }).toEqual({ currentPoints: 110, previewPoints: 135, currentText: undefined, previewText: 'Preview-only rule text.' })
})

it('applies root overlays when materializing one source for patch verification', async () => {
  const directory = path.join(root, 'definitions-only')
  await materializeCatalogue(directory, catalogueSources, {
    source: 'definitions',
    composition: composition(),
    patchesDirectory: path.join(root, 'patches'),
  })
  expect({
    detachment: loadCatalogue(directory)?.detachments.get('cat')?.options[0]?.id,
    editions: fs.existsSync(path.join(directory, 'editions')),
    points: fs.existsSync(path.join(directory, 'points')),
  }).toEqual({ detachment: 'released-detachment', editions: false, points: false })
})

it('preserves data-update history identities when a preview becomes the default', async () => {
  const directory = await materialize()
  const before = compiledChangeSource(directory, CANONICAL_CATALOGUE_SOURCE_NAMES)!
  const manifest = composition()
  const edition = manifest.editions[0]!.edition
  edition.status = 'released'
  edition.default = true
  edition.releases.push({ at: 2, status: 'released' })
  await materialize(manifest)
  const after = compiledChangeSource(directory, CANONICAL_CATALOGUE_SOURCE_NAMES)!
  expect(catalogueChanges(before, after)).toEqual({ factions: [], omitted: 0 })
})

async function materializeChapterEdition() {
  const original = fetch
  vi.stubGlobal('fetch', async (url: string | URL) => {
    if (String(url).includes(`/${catalogueSources.definitions.repository}/`)) {
      return archive({
        'Marines.json': book('Custodes', 100, 'old-detachment'),
        'System.json': JSON.stringify(system),
        'Chapter.json': JSON.stringify({
          catalogue: {
            id: 'chapter',
            name: 'Chapter',
            catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
            selectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(50) }],
          },
        }),
        'Unrelated.json': JSON.stringify({
          catalogue: { id: 'unrelated', name: 'Unrelated', selectionEntries: [{ id: 'other', name: 'Other', type: 'unit' }] },
        }),
      })
    }
    if (String(url).includes(`/${catalogueSources.datacards.repository}/`)) {
      return archive({
        '11th/gdc/Custodes.json': JSON.stringify({
          name: 'Custodes',
          datasheets: [{ name: { en: 'Guard' } }],
          detachments: [{ name: { en: 'codex-detachment' }, detachmentPoints: 1, forceDisposition: { name: { en: 'Disruption' } } }],
        }),
      })
    }
    return original(url)
  })
  const manifest = composition()
  const edition = manifest.editions[0]!.edition
  edition.catalogueIds = ['chapter']
  const directory = await materialize(manifest)
  const target = path.join(directory, 'editions', edition.id)
  return { directory, target, edition }
}

it('records inherited unit price changes without recording unrelated support factions', async () => {
  const { directory, target, edition } = await materializeChapterEdition()
  const before = compiledChangeSource(directory, CANONICAL_CATALOGUE_SOURCE_NAMES)!
  fs.writeFileSync(path.join(target, 'definitions', 'Marines.json'), book('Custodes', 135, 'codex-detachment'))
  const after = compiledChangeSource(directory, CANONICAL_CATALOGUE_SOURCE_NAMES)!
  expect({
    changes: catalogueChanges(before, after).factions.map((faction) => ({ catalogueId: faction.catalogueId, changes: faction.changes })),
    unrelated: after.datasheets.some((sheet) => sheet.catalogueId === `${edition.id}~unrelated`),
  }).toEqual({
    changes: [
      {
        catalogueId: 'custodes-codex~cat',
        changes: [
          { kind: 'datasheet-points', id: 'guard-offer', name: 'Guard', rows: [{ models: null, condition: null, from: '120', to: '135' }] },
        ],
      },
    ],
    unrelated: false,
  })
})

it('records inherited detachment price changes in their qualified reference home', async () => {
  const { directory, target } = await materializeChapterEdition()
  const before = compiledChangeSource(directory, CANONICAL_CATALOGUE_SOURCE_NAMES)!
  const file = path.join(target, 'datacards', '11th', 'gdc', 'Custodes.json')
  const updated = JSON.parse(fs.readFileSync(file, 'utf8'))
  updated.detachments[0].detachmentPoints = 2
  fs.writeFileSync(file, JSON.stringify(updated))
  const after = compiledChangeSource(directory, CANONICAL_CATALOGUE_SOURCE_NAMES)!
  expect(catalogueChanges(before, after).factions).toEqual([
    {
      catalogueId: 'custodes-codex~cat',
      faction: 'Custodes · Custodes codex · Preview',
      changes: [{ kind: 'detachment-points', id: 'codex-detachment', name: 'codex-detachment', from: '1', to: '2' }],
    },
  ])
})

it('promotes the preview without changing saved catalogue IDs or replacing old data', async () => {
  const manifest = composition()
  const edition = manifest.editions[0]!.edition
  edition.status = 'released'
  edition.default = true
  edition.releases.push({ at: 2, status: 'released' })
  const directory = await materialize(manifest)
  const versions = catalogueEditionLoaders(
    directory,
    () => loadCatalogue(directory),
    () => null,
  )
  expect({
    defaultId: versions.factions()?.factions.find((faction) => faction.isDefault)?.id,
    old: versions.catalogueFor('cat')?.index.definitions.get('guard')?.costs?.[0]?.value,
    oldRoute: versions.factions()?.factions.find((faction) => faction.id === 'cat')?.slug,
    savedPreviewId: versions.catalogueFor('custodes-codex~cat')?.factions[0]?.id,
  }).toEqual({ defaultId: 'custodes-codex~cat', old: 110, oldRoute: 'cat', savedPreviewId: 'custodes-codex~cat' })
})

it('fails atomically when an overlay file is absent', async () => {
  const manifest = composition()
  manifest.overlays[0]!.files = ['Missing.json']
  const directory = path.join(root, 'data')
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, 'previous'), 'retained')
  await expect(materialize(manifest)).rejects.toThrow('missing overlay file')
  expect(fs.readdirSync(directory)).toEqual(['previous'])
})

it('rejects broken imported-book dependencies before activation', async () => {
  const original = fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) =>
      String(url).includes('/praetorium/custom/')
        ? archive({
            'Marines.json': JSON.stringify({
              catalogue: { id: 'cat', name: 'Custodes', catalogueLinks: [{ targetId: 'missing-library', importRootEntries: true }] },
            }),
          })
        : original(url),
    ),
  )
  await expect(materialize()).rejects.toThrow('imports missing catalogue')
})

it('records authored source pins inside the immutable snapshot', async () => {
  const directory = await materialize()
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  for (const name of ['battlemaster', 'icons'] as const) {
    revisions[name] = catalogueSources[name].revision
    const file = path.join(directory, name, name === 'battlemaster' ? 'layouts/test.json' : 'test.svg')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, name === 'battlemaster' ? '{}' : '<svg/>')
  }
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify(revisions))
  const archiveFile = path.join(root, 'snapshot.zip')
  const pointerFile = path.join(root, 'pointer.json')
  const pointer = packCatalogueSnapshot(directory, archiveFile, pointerFile)
  const installed = path.join(root, 'installed')
  installSnapshotArchive(installed, archiveFile, pointer, null)
  expect(JSON.parse(fs.readFileSync(path.join(installed, 'provenance.json'), 'utf8')).composition.editions[0].overlays[0].repository).toBe(
    'praetorium/custom',
  )
})

it('refreshes cached saved-roster prices, totals and legality after an edition-only correction', async () => {
  const originalFetch = fetch
  vi.stubGlobal('fetch', async (url: string | URL) =>
    String(url).includes('/praetorium/custom/')
      ? archive({ 'Marines.json': `${book('Custodes', 120, 'codex-detachment')}\n` })
      : originalFetch(url),
  )
  const patchDirectory = path.join(root, 'patches', 'editions', 'custodes-codex', 'definitions')
  fs.mkdirSync(patchDirectory, { recursive: true })
  const saved = {
    id: 'edition-correction',
    updatedAt: 1,
    catalogueId: 'custodes-codex~cat',
    detachmentIds: [],
    disposition: null,
    limit: 127,
    picks: [{ entryId: 'guard-offer', models: 1 }],
    waivedRules: [],
    optionalRules: [],
    borrowedDetachmentId: null,
  }
  const prices = []
  for (const cost of [125, 130]) {
    const original = book('Custodes', 120, 'codex-detachment')
    fs.writeFileSync(
      path.join(patchDirectory, 'price.patch'),
      `--- a/definitions/Marines.json\n+++ b/definitions/Marines.json\n@@ -1 +1 @@\n-${original}\n+${book('Custodes', cost, 'codex-detachment')}\n`,
    )
    const directory = await materialize()
    const base = loadCatalogue(directory)!
    const versions = catalogueEditionLoaders(
      directory,
      () => base,
      () => null,
    )
    reads.factionIndexFor.mockImplementation(async () => versions.factions())
    reads.catalogueFor.mockImplementation(async (id: string) => versions.catalogueFor(id))
    reads.rulesFor.mockImplementation(
      async (id: string) =>
        versions.rulesFor(id) ?? {
          factionNames: new Map(),
          factionKeys: new Map(),
          detachmentReferences: new Map(),
          detachmentDetails: new Map(),
          factionRestrictions: new Map(),
        },
    )
    const price = await cachedRosterPrice(saved)
    const [totals] = await cachedRosterTotalsFor([saved])
    const [assessment] = await cachedRosterAssessmentsFor([saved])
    prices.push({ price: price?.points, totals: totals?.points, assessment: assessment?.points })
  }
  expect(prices).toEqual([
    { price: 125, totals: 125, assessment: 125 },
    { price: 130, totals: 130, assessment: 130 },
  ])
})
