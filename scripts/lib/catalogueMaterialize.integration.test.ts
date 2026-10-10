import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalogueSources } from '../../src/server/catalogueSources'
import { packCatalogueSnapshot } from '../../src/server/catalogueSnapshot'
import { materializeCatalogue } from './catalogueMaterialize'

let root: string
let directory: string
const catalogKey = 'pinned catalog'
const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
const owner = '01234567-89ab-cdef-0123-456789abcdef'
const slot = { archetypeA: 'purge-the-foe', archetypeB: 'reconnaissance', slotIndex: 1 }
const terrain = [{ footprint: { origin: { x: 0, y: 0 }, widthIn: 4, heightIn: 2, rotationDeg: 0 } }]
const objectiveLayout = {
  format: 'battlemaster.tts.chapter-approved-layout-lite',
  layout: { id, chapterApprovedSlot: slot, chapterApprovedDeploymentKey: 3 },
  litePayload: { v: 1, k: 'bml', id, b: 'sf60x44', a: 'c', s: ['purge-the-foe', 'reconnaissance', 1, 3], i: [[0, 2, 1, 0, 0, 'c']] },
}

function sources() {
  return {
    ...catalogueSources,
    battlemaster: { ...catalogueSources.battlemaster, revision: createHash('sha256').update(catalogKey).digest('hex') },
    icons: { ...catalogueSources.icons, icons: { 'test-faction': 'test/icon.svg' } },
  }
}

function archive(files: Record<string, string>) {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [`repository/${name}`, new TextEncoder().encode(value)])))
}

function downloads() {
  return vi.fn(async (url: string | URL) => {
    const target = String(url)
    if (target.includes(`/${catalogueSources.definitions.repository}/zip/`))
      return new Response(archive({ 'unit.json': '{"name":"Unit"}\n' }))
    if (target.includes(`/${catalogueSources.points.repository}/zip/`))
      return new Response(archive({ 'data/points.yaml': 'points: 100\n' }))
    if (target.includes(`/${catalogueSources.datacards.repository}/zip/`)) {
      return new Response(archive({ '11th/gdc/core.json': '{}', '10th/gdc/core.json': '{}' }))
    }
    if (target.includes(`/${catalogueSources.icons.repository}/zip/`)) {
      return new Response(
        archive({
          'src/svgs/test/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
          'src/svgs/unused.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
        }),
      )
    }
    if (target.includes('/v1.1/public/tts/layouts')) {
      return Response.json({ catalogKey, layouts: [{ id, owner, layoutKey: 'layout-key' }] })
    }
    if (target.includes('/chapter-approved-layout-lite')) return Response.json(objectiveLayout)
    return Response.json({ layout: { id, layoutKey: 'layout-key', chapterApprovedSlot: slot, chapterApprovedDeploymentKey: 3 }, terrain })
  })
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-materialize-'))
  directory = path.join(root, 'catalogue-data')
  vi.stubGlobal('fetch', downloads())
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(root, { recursive: true, force: true })
})

it('builds from the committed pins', async () => {
  const config = sources()
  await materializeCatalogue(directory, config, { patchesDirectory: path.join(root, 'patches') })

  expect(JSON.parse(fs.readFileSync(path.join(directory, 'definitions', 'unit.json'), 'utf8'))).toEqual({ name: 'Unit' })
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))).toEqual(
    Object.fromEntries(Object.entries(config).map(([name, source]) => [name, source.revision])),
  )
  expect(
    vi
      .mocked(fetch)
      .mock.calls.map(([url]) => (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url))
      .filter((url) => url.includes('codeload.github.com')),
  ).toEqual(
    ['definitions', 'points', 'datacards', 'icons'].map((name) => {
      const source = config[name as keyof typeof config]
      return `https://codeload.github.com/${'repository' in source ? source.repository : ''}/zip/${source.revision}`
    }),
  )
})

it('includes only the configured Game Datacards edition and selected icons', async () => {
  await materializeCatalogue(directory, sources(), { patchesDirectory: path.join(root, 'patches') })

  expect(fs.existsSync(path.join(directory, 'datacards', '10th'))).toBe(false)
  expect(fs.readdirSync(path.join(directory, 'icons'))).toEqual(['test-faction.svg'])
})

it('omits disabled sources without fetching or retaining old files', async () => {
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, 'old.json'), '{}')
  const download = vi.fn()
  vi.stubGlobal('fetch', download)
  await materializeCatalogue(directory, sources(), {
    disabled: new Set(['definitions', 'points', 'datacards', 'battlemaster', 'icons']),
    patchesDirectory: path.join(root, 'patches'),
  })

  expect({ files: fs.readdirSync(directory), requests: download.mock.calls }).toEqual({ files: ['revision.json'], requests: [] })
})

it('applies local corrections before activating the completed catalogue', async () => {
  const patchesDirectory = path.join(root, 'patches')
  fs.mkdirSync(path.join(patchesDirectory, 'definitions'), { recursive: true })
  fs.writeFileSync(
    path.join(patchesDirectory, 'definitions', '001-name.patch'),
    'diff --git a/definitions/unit.json b/definitions/unit.json\n--- a/definitions/unit.json\n+++ b/definitions/unit.json\n@@ -1 +1 @@\n-{"name":"Unit"}\n+{"name":"Corrected unit"}\n',
  )
  await materializeCatalogue(directory, sources(), { patchesDirectory })

  expect(JSON.parse(fs.readFileSync(path.join(directory, 'definitions', 'unit.json'), 'utf8'))).toEqual({ name: 'Corrected unit' })
})

it('preserves the previous catalogue when a correction no longer applies', async () => {
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, 'previous.json'), '{"id":"previous"}')
  const patchesDirectory = path.join(root, 'patches')
  fs.mkdirSync(path.join(patchesDirectory, 'definitions'), { recursive: true })
  fs.writeFileSync(
    path.join(patchesDirectory, 'definitions', '001-stale.patch'),
    'diff --git a/definitions/unit.json b/definitions/unit.json\n--- a/definitions/unit.json\n+++ b/definitions/unit.json\n@@ -1 +1 @@\n-{"name":"Old unit"}\n+{"name":"Corrected unit"}\n',
  )

  await expect(materializeCatalogue(directory, sources(), { patchesDirectory })).rejects.toThrow('does not apply')
  expect(fs.readdirSync(directory)).toEqual(['previous.json'])
})

it('preserves the previous catalogue when the terrain no longer matches its pin', async () => {
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, 'previous.json'), '{}')
  const config = sources()
  config.battlemaster.revision = '0'.repeat(64)

  await expect(materializeCatalogue(directory, config, { patchesDirectory: path.join(root, 'patches') })).rejects.toThrow('pinned revision')
  expect(fs.readdirSync(directory)).toEqual(['previous.json'])
})

it('refuses to replace an activated shared snapshot symlink', async () => {
  const cache = path.join(root, 'cache')
  fs.mkdirSync(cache)
  fs.symlinkSync(cache, directory)

  await expect(materializeCatalogue(directory, sources())).rejects.toThrow('snapshot symlink')
  expect(fs.lstatSync(directory).isSymbolicLink()).toBe(true)
})

it('materializes one source separately without claiming a complete catalogue', async () => {
  await materializeCatalogue(directory, sources(), { source: 'datacards', patchesDirectory: path.join(root, 'patches') })

  expect(fs.readdirSync(directory).toSorted()).toEqual(['datacards', 'revision.json'])
  expect(() => packCatalogueSnapshot(directory, path.join(root, 'snapshot.zip'), path.join(root, 'current.json'))).toThrow(
    'no definitions revision',
  )
})

it('preserves a snapshot symlink activated while sources are downloading', async () => {
  const cache = path.join(root, 'cache')
  fs.mkdirSync(cache)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      fs.symlinkSync(cache, directory)
      return new Response(archive({ '11th/gdc/core.json': '{}' }))
    }),
  )

  await expect(
    materializeCatalogue(directory, sources(), { source: 'datacards', patchesDirectory: path.join(root, 'patches') }),
  ).rejects.toThrow('snapshot symlink')
  expect(fs.readlinkSync(directory)).toBe(cache)
})

it('rejects an explicitly requested source that is disabled', async () => {
  const download = vi.fn()
  vi.stubGlobal('fetch', download)

  await expect(materializeCatalogue(directory, sources(), { source: 'datacards', disabled: new Set(['datacards']) })).rejects.toThrow(
    'is disabled',
  )
  expect(download).not.toHaveBeenCalled()
})

it('accepts the current Battlemaster detail identity', async () => {
  const updatedAt = '2026-08-12 20:32:30.796047+00'
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) =>
      String(url).includes('/v1.1/public/tts/layouts')
        ? Response.json({
            catalogKey,
            layouts: [{ id, owner, ownerUsername: 'superwutz', name: 'Test layout', updatedAt, layoutKey: `${id}@${updatedAt}` }],
          })
        : String(url).includes('/chapter-approved-layout-lite')
          ? Response.json(objectiveLayout)
          : Response.json({
              format: 'battlemaster.data.layout',
              layout: {
                name: 'Test layout',
                owner: 'superwutz',
                updatedAt,
                layoutKey: '76fdff708ff2926a',
                links: { page: `https://battlemaster.online/community/layout/${owner}/${id}` },
                chapterApprovedSlot: slot,
                chapterApprovedDeploymentKey: 3,
              },
              terrain,
            }),
    ),
  )
  await materializeCatalogue(directory, sources(), { source: 'battlemaster', patchesDirectory: path.join(root, 'patches') })

  expect(fs.existsSync(path.join(directory, 'battlemaster', 'layouts', `${id}.json`))).toBe(true)
})

it('materializes layout objectives with their pinned terrain detail', async () => {
  await materializeCatalogue(directory, sources(), { source: 'battlemaster', patchesDirectory: path.join(root, 'patches') })
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'battlemaster', 'layouts', `${id}.lite.json`), 'utf8'))).toEqual(objectiveLayout)
})

it('preserves the active source when objective terrain does not match', async () => {
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, 'current.json'), '{}')
  const download = downloads()
  const stale = structuredClone(objectiveLayout)
  stale.litePayload.i[0]![1] = 20
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => (String(url).includes('/chapter-approved-layout-lite') ? Response.json(stale) : download(url))),
  )
  await expect(
    materializeCatalogue(directory, sources(), { source: 'battlemaster', patchesDirectory: path.join(root, 'patches') }),
  ).rejects.toThrow('objective terrain 1')
  expect(fs.readdirSync(directory)).toEqual(['current.json'])
})

it('rejects selected icons containing scripts', async () => {
  const download = downloads()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) =>
      String(url).includes(catalogueSources.icons.repository)
        ? new Response(archive({ 'src/svgs/test/icon.svg': '<svg><script>alert(1)</script></svg>' }))
        : download(url),
    ),
  )

  await expect(materializeCatalogue(directory, sources(), { patchesDirectory: path.join(root, 'patches') })).rejects.toThrow(
    'invalid icon file',
  )
  expect(fs.existsSync(directory)).toBe(false)
})
