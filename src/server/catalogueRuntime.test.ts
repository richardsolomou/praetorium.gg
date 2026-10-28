import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readCatalogueRuntime, type RuntimeConstruction } from './catalogueRuntime'
import { writeCatalogueRuntime } from '../../scripts/lib/catalogueRuntime'
import { system } from './catalogue.fixtures'
import { catalogueEditionLoaders } from './catalogueEditions'
import { loadCatalogue } from './catalogueIndex'
import { unitSummaries, unitsIn } from '../shared/cataloguePicker'
import { pickerUnitsFor } from '../shared/pickerUnits'
import { completeSteps } from '../shared/steps'
import { calculateRosterPrice } from '../shared/pricing'
import { compileCanonicalCatalogue } from './canonicalCatalogue'
import { prepareCatalogueRuntime } from '../../scripts/lib/catalogueRuntimeCache'

let directory: string
let output: string
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-runtime-'))
  output = path.join(directory, 'runtime')
  fs.mkdirSync(path.join(directory, 'definitions'))
  fs.writeFileSync(path.join(directory, 'definitions', 'system.json'), JSON.stringify(system))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'authored-test' }))
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(directory, { recursive: true, force: true })
})

it('reads prepared reference data without retaining construction data', () => {
  writeCatalogueRuntime(directory, output)
  const runtime = readCatalogueRuntime(directory, output)
  expect(runtime.read('startup')).toMatchObject({ factions: { factions: [] }, canonical: { datasheets: [] }, combatUnits: [] })
})

it('rejects prepared data from a different source revision', () => {
  writeCatalogueRuntime(directory, output)
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'changed' }))
  expect(() => readCatalogueRuntime(directory, output)).toThrow('does not match')
})

it('rejects altered generated JSON before reading its records', () => {
  writeCatalogueRuntime(directory, output)
  const runtime = readCatalogueRuntime(directory, output)
  const file = path.join(output, 'startup.json')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('datasheets', 'datasheett'))
  expect(() => runtime.read('startup')).toThrow('verification failed')
})

it('rejects a runtime file whose size differs from its manifest', () => {
  writeCatalogueRuntime(directory, output)
  const runtime = readCatalogueRuntime(directory, output)
  fs.appendFileSync(path.join(output, 'startup.json'), ' ')
  expect(() => runtime.read('startup')).toThrow('verification failed')
})

it.each(['composition.json', 'reference-policy.json'])('rejects runtime data after changing %s', (file) => {
  writeCatalogueRuntime(directory, output)
  fs.writeFileSync(path.join(directory, file), '{}')
  expect(() => readCatalogueRuntime(directory, output)).toThrow('does not match')
})

it('fails closed when the prepared startup file is missing', () => {
  writeCatalogueRuntime(directory, output)
  const runtime = readCatalogueRuntime(directory, output)
  fs.unlinkSync(path.join(output, 'startup.json'))
  expect(() => runtime.read('startup')).toThrow()
})

it('rejects an unknown runtime format', () => {
  writeCatalogueRuntime(directory, output)
  const file = path.join(output, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, JSON.stringify({ ...manifest, format: 'future' }))
  expect(() => readCatalogueRuntime(directory, output)).toThrow()
})

it('leaves the verified source snapshot untouched', () => {
  const files = fs.readdirSync(directory)
  writeCatalogueRuntime(directory, output)
  expect(fs.readdirSync(directory).filter((name) => name !== 'runtime')).toEqual(files)
})

function withEditions(defaultEdition = false, sharedOptions = false) {
  const army = {
    catalogue: {
      id: 'army',
      name: 'Army',
      gameSystemId: 'gs',
      selectionEntries: [
        {
          id: 'unit',
          name: 'Authored unit',
          type: 'unit',
          costs: [{ name: 'pts', typeId: 'cost-pts', value: 10 }],
          selectionEntryGroups: [
            {
              id: 'options',
              selectionEntries: [
                { id: 'local', name: 'Upgrade', type: 'upgrade', costs: [{ name: 'pts', typeId: 'cost-pts', value: 15 }] },
              ],
            },
          ],
        },
      ],
    },
  }
  fs.writeFileSync(path.join(directory, 'definitions', 'army.json'), JSON.stringify(army))
  fs.writeFileSync(
    path.join(directory, 'definitions', 'unrelated.json'),
    JSON.stringify({
      catalogue: { id: 'unrelated', name: 'Unrelated', selectionEntries: [{ id: 'old', name: 'Upgrade', type: 'upgrade' }] },
    }),
  )
  if (sharedOptions)
    fs.writeFileSync(
      path.join(directory, 'definitions', 'zz-support.json'),
      JSON.stringify({
        catalogue: {
          id: 'support',
          name: 'Support',
          library: true,
          sharedSelectionEntryGroups: [
            {
              id: 'options',
              selectionEntries: [{ id: 'old', name: 'Upgrade', type: 'upgrade', costs: [{ name: 'pts', typeId: 'cost-pts', value: 15 }] }],
            },
          ],
        },
      }),
    )
  const editions = [1, 2, 3].map((number) => ({
    edition: {
      id: `version-${number}`,
      name: `Version ${number}`,
      status: 'released',
      default: defaultEdition && number === 1,
      catalogueIds: ['army'],
      releases: [{ at: 1, status: 'released' }],
    },
    sources: {},
    overlays: [],
  }))
  fs.writeFileSync(
    path.join(directory, 'composition.json'),
    JSON.stringify({ format: 'praetorium.catalogue-composition.v1', overlays: [], editions }),
  )
  for (const { edition } of editions) {
    const target = path.join(directory, 'editions', edition.id)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.cpSync(path.join(directory, 'definitions'), path.join(target, 'definitions'), { recursive: true })
    fs.copyFileSync(path.join(directory, 'revision.json'), path.join(target, 'revision.json'))
  }
  writeCatalogueRuntime(directory, output)
  return runtimeLoaders()
}

function runtimeLoaders() {
  const base = loadCatalogue(directory)!
  return catalogueEditionLoaders(
    directory,
    () => base,
    () => null,
    readCatalogueRuntime(directory, output),
  )
}

function replaceRuntimeFile(key: string, content: string) {
  fs.writeFileSync(path.join(output, `${key}.json`), content)
  const manifestFile = path.join(output, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  manifest.files[key] = { bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))
}

const constructionLists = (versions: ReturnType<typeof runtimeLoaders>) =>
  ['army', 'version-1~army'].map((id) => {
    const loaded = versions.catalogueFor(id)!
    return [unitSummaries(loaded, id, { factionCards: true, nonMatchedPlay: true }).get(), pickerUnitsFor(loaded, null, id, '')]
  })

it('lists construction summaries from the compiled runtime', () => {
  withEditions()
  const table = JSON.parse(fs.readFileSync(path.join(output, 'construction.json'), 'utf8')) as RuntimeConstruction
  replaceRuntimeFile('construction', JSON.stringify({ ...table, rows: table.rows.map((row) => ({ ...row, points: 999 })) }))
  const versions = runtimeLoaders()
  completeSteps(versions.construction('serving'))
  completeSteps(versions.construction('others'))
  expect(
    constructionLists(versions)
      .flat(2)
      .map((unit) => unit.points),
  ).toEqual([999, 999, 999, 999])
})

it('recompiles version 12 packages when preparing the base and edition runtime', async () => {
  withEditions()
  const previous = readCatalogueRuntime(directory, output)
  const stale = (catalogue: ReturnType<typeof compileCanonicalCatalogue>) => ({
    ...catalogue,
    compilerVersion: 12,
    datasheets: catalogue.datasheets.map((sheet) => ({ ...sheet, points: 999 })),
  })
  fs.mkdirSync(path.join(directory, 'canonical'))
  fs.writeFileSync(
    path.join(directory, 'canonical', 'catalogue.json'),
    JSON.stringify(stale(compileCanonicalCatalogue(loadCatalogue(directory)!, { definitions: 'authored-test' }))),
  )
  fs.writeFileSync(
    path.join(directory, 'canonical', 'editions.json'),
    JSON.stringify({ catalogues: { 'version-1:': stale(previous.read('version-1.canonical')) } }),
  )
  await prepareCatalogueRuntime(directory, output, null, 'runtime-test', undefined, {
    has: async () => false,
    download: async () => false,
    upload: async () => undefined,
  })
  const prepared = readCatalogueRuntime(directory, output)
  expect([
    prepared.read('startup').canonical.datasheets.find((sheet) => sheet.catalogueId === 'army')?.points,
    prepared.read('version-1.canonical').datasheets[0]?.points,
  ]).toEqual([10, 10])
})

it('preserves complete source context for edition construction', () => {
  const versions = withEditions()
  expect([...versions.catalogueFor('version-1~army')!.index.catalogues.keys()]).toEqual(['version-1~army', 'gs', 'version-1~unrelated'])
})

it('preserves source prices after loading an edition on demand', () => {
  const versions = withEditions()
  expect(unitsIn(versions.catalogueFor('version-1~army')!, 'version-1~army', '').map((unit) => unit.points)).toEqual([10])
})

it('preserves source ownership when a shared option group is defined outside declared imports', () => {
  const versions = withEditions(false, true)
  expect(
    calculateRosterPrice(
      {
        catalogueId: 'version-1~army',
        detachmentIds: [],
        disposition: null,
        units: [{ entryId: 'unit', choices: { options: 'old' } }],
        limit: 1000,
      },
      versions.catalogueFor('version-1~army'),
      versions.rulesFor('version-1~army'),
    )?.points,
  ).toBe(25)
})

it('preserves a legacy book ID that also matches the current faction route', () => {
  const versions = withEditions(true)
  expect(versions.resolve('army')).toBe('army')
})

it('shares edition reference records with the combined reference', () => {
  withEditions()
  const runtime = readCatalogueRuntime(directory, output)
  const edition = runtime.read('version-1.canonical')
  expect(edition.datasheets[0]).toBe(runtime.read('startup').canonical.datasheets.find((sheet) => sheet.catalogueId === 'version-1~army'))
})

it.each([-1, 0.5, 999999])('rejects an invalid prepared reference index %s', (index) => {
  withEditions()
  const file = path.join(output, 'version-1.canonical.json')
  const reference = JSON.parse(fs.readFileSync(file, 'utf8'))
  replaceRuntimeFile('version-1.canonical', JSON.stringify({ ...reference, datasheets: [index] }))
  expect(() => readCatalogueRuntime(directory, output).read('version-1.canonical')).toThrow('invalid index')
})

it('retains construction versions after other versions are read', () => {
  const versions = withEditions()
  const first = versions.catalogueFor('version-1~army')!
  versions.catalogueFor('version-2~army')
  versions.catalogueFor('version-3~army')
  expect(versions.catalogueFor('version-1~army')).toBe(first)
})

it('prepares every construction version before requests arrive', () => {
  const versions = withEditions()
  versions.prepare()
  fs.rmSync(path.join(directory, 'editions'), { recursive: true })
  expect(
    [1, 2, 3].map((number) => versions.catalogueFor(`version-${number}~army`)?.index.catalogues.has(`version-${number}~army`)),
  ).toEqual([true, true, true])
})

it('retains prepared reference versions after other versions are read', () => {
  const versions = withEditions()
  const first = versions.canonicalFor('version-1~army')
  versions.canonicalFor('version-2~army')
  versions.canonicalFor('version-3~army')
  fs.unlinkSync(path.join(output, 'version-1.canonical.json'))
  expect(versions.canonicalFor('version-1~army')).toBe(first)
})

it('prepares every advertised reference version before requests arrive', () => {
  const versions = withEditions()
  versions.prepare()
  fs.rmSync(output, { recursive: true })
  expect([1, 2, 3].map((number) => versions.canonicalFor(`version-${number}~army`)?.datasheets.length)).toEqual([1, 1, 1])
})

it('restores the previous runtime when replacement publication fails', () => {
  writeCatalogueRuntime(directory, output)
  const rename = fs.renameSync
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === output && !String(from).includes('.previous-')) throw new Error('Publication failed')
    rename(from, to)
  })
  expect(() => writeCatalogueRuntime(directory, output)).toThrow('Publication failed')
  expect(readCatalogueRuntime(directory, output).read('startup').canonical.datasheets).toEqual([])
})

it('does not read source definitions while preparing references, search and combat pickers', () => {
  const versions = withEditions()
  fs.rmSync(path.join(directory, 'definitions'), { recursive: true })
  fs.rmSync(path.join(directory, 'editions'), { recursive: true })
  expect([
    versions.factions()!.factions.length,
    versions.canonicalCatalogue(null)!.datasheets.length,
    versions.combatUnits().length,
    versions.searchIndex()!.datasheets.length,
  ]).toEqual([4, 4, 1, 1])
})
