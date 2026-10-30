import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { extractSourceArchive, fetchBattlemasterInto } from './sync'

let directory: string
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-sync-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(directory, { recursive: true, force: true })
})

it('extracts the configured Game Datacards path without other editions', () => {
  const archive = zipSync({
    'repository/11th/gdc/core.json': new TextEncoder().encode('{}'),
    'repository/10th/gdc/core.json': new TextEncoder().encode('{}'),
  })
  extractSourceArchive(archive, 'repository', directory, '11th/gdc')

  expect(fs.existsSync(path.join(directory, '10th'))).toBe(false)
  expect(fs.existsSync(path.join(directory, '11th', 'gdc', 'core.json'))).toBe(true)
})

it('keeps the current source when an archive lacks its configured subpath', () => {
  fs.writeFileSync(path.join(directory, 'current.json'), '{}')
  const archive = zipSync({ 'repository/tools/package.json': new TextEncoder().encode('{}') })

  expect(() => extractSourceArchive(archive, 'repository', directory, '11th/gdc')).toThrow('archive contains no files under 11th/gdc')
  expect(fs.existsSync(path.join(directory, 'current.json'))).toBe(true)
})

const layoutId = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
const slot = { archetypeA: 'purge-the-foe', archetypeB: 'reconnaissance', slotIndex: 1 }
const battlemaster = {
  revision: createHash('sha256').update('catalog-key').digest('hex'),
  baseUrl: 'https://battlemaster.online' as const,
  owner: 'owner',
  missionPack: 'chapter-approved-2026' as const,
  license: null,
  attribution: 'Battlemaster',
}
const layoutDetail = (layoutKey: string) => ({
  layout: { id: layoutId, layoutKey, chapterApprovedSlot: slot, chapterApprovedDeploymentKey: 3 },
  terrain: [{ footprint: { origin: { x: -9, y: -3 }, widthIn: 8, heightIn: 4, rotationDeg: 0 } }],
})
const layoutLite = {
  format: 'battlemaster.tts.chapter-approved-layout-lite',
  layout: { id: layoutId, chapterApprovedSlot: slot, chapterApprovedDeploymentKey: 3 },
  litePayload: {
    v: 1,
    k: 'bml',
    id: layoutId,
    b: 'sf60x44',
    a: 'c',
    s: ['purge-the-foe', 'reconnaissance', 1, 3],
    i: [[0, -5, -1, 0, 0, 'c']],
  },
}

function stubBattlemaster() {
  const requests: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      requests.push(input.pathname)
      if (input.pathname === '/v1.1/public/tts/layouts')
        return Response.json({ catalogKey: 'catalog-key', layouts: [{ id: layoutId, owner: '0123', layoutKey: 'current' }] })
      if (input.pathname.startsWith('/v1/public/data/layouts/')) return Response.json(layoutDetail('current'))
      return Response.json(layoutLite)
    }),
  )
  return requests
}

const detailRequests = (requests: string[]) => requests.filter((request) => request.startsWith('/v1/public/data/layouts/')).length

it('reuses cached Battlemaster layouts for the pinned catalogue revision', async () => {
  const requests = stubBattlemaster()
  const cache = path.join(directory, 'cache')
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'first'), cache)
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'second'), cache)

  expect(detailRequests(requests)).toBe(1)
})

it('serves the cached layout files unchanged', async () => {
  stubBattlemaster()
  const cache = path.join(directory, 'cache')
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'first'), cache)
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'second'), cache)

  const read = (target: string) => fs.readFileSync(path.join(directory, target, 'layouts', `${layoutId}.lite.json`), 'utf8')
  expect(read('second')).toBe(read('first'))
})

it('downloads a cached layout again when its layout key no longer matches the catalogue', async () => {
  const requests = stubBattlemaster()
  const cache = path.join(directory, 'cache')
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'first'), cache)
  fs.writeFileSync(path.join(cache, battlemaster.revision, 'layouts', `${layoutId}.json`), JSON.stringify(layoutDetail('stale')))
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'second'), cache)

  expect(detailRequests(requests)).toBe(2)
})

it('replaces a stale cached layout with the downloaded one', async () => {
  stubBattlemaster()
  const cache = path.join(directory, 'cache')
  const cached = path.join(cache, battlemaster.revision, 'layouts', `${layoutId}.json`)
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'first'), cache)
  fs.writeFileSync(cached, JSON.stringify(layoutDetail('stale')))
  await fetchBattlemasterInto(battlemaster, path.join(directory, 'second'), cache)

  expect(JSON.parse(fs.readFileSync(cached, 'utf8')).layout.layoutKey).toBe('current')
})

it('refuses an oversized Battlemaster catalogue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ catalogKey: 'catalog-key', layouts: [], padding: 'x'.repeat(1024 * 1024) })),
  )

  await expect(fetchBattlemasterInto(battlemaster, path.join(directory, 'target'), null)).rejects.toThrow('catalog exceeds')
})

it('refuses a Battlemaster catalogue whose layouts are malformed', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ catalogKey: 'catalog-key', layouts: [{ id: layoutId }] })),
  )

  await expect(fetchBattlemasterInto(battlemaster, path.join(directory, 'target'), null)).rejects.toThrow('catalog has an unexpected shape')
})
