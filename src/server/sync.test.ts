import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalogueSources as config, type ResolvedCatalogueSources } from './catalogueSources'
import { syncFactionIcons, syncSources } from './sync'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'

let directory: string
let sources: ResolvedCatalogueSources
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

beforeEach(() => {
  sources = {
    definitions: { ...config.definitions, revision: 'definitions-revision' },
    marineCodex: { ...config.marineCodex, revision: 'marine-codex-revision' },
    points: { ...config.points, revision: 'points-revision' },
    datacards: { ...config.datacards, revision: 'datacards-revision' },
    battlemaster: { ...config.battlemaster, revision: 'battlemaster-revision' },
  }
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-sync-'))
  for (const name of ['definitions', 'marineCodex', 'points', 'datacards']) fs.mkdirSync(path.join(directory, name))
  for (const file of sources.marineCodex.files ?? []) {
    fs.writeFileSync(path.join(directory, 'marineCodex', file), '{}')
    fs.writeFileSync(path.join(directory, 'definitions', file), '{}')
  }
  fs.mkdirSync(path.join(directory, 'faction-icons'))
  for (const { id } of SUPPLEMENTAL_FACTION_ICONS) fs.writeFileSync(path.join(directory, 'faction-icons', `${id}.svg`), '<svg/>')
  fs.writeFileSync(
    path.join(directory, 'revision.json'),
    JSON.stringify({
      definitions: sources.definitions.revision,
      marineCodex: sources.marineCodex.revision,
      points: sources.points.revision,
      datacards: sources.datacards.revision,
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(directory, { recursive: true, force: true })
})

it('adds supplemental icons to a materialized source directory', async () => {
  fs.rmSync(path.join(directory, 'faction-icons'), { recursive: true })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  )

  await syncFactionIcons(directory)

  expect(fs.readdirSync(path.join(directory, 'faction-icons')).toSorted()).toEqual(
    SUPPLEMENTAL_FACTION_ICONS.map((icon) => `${icon.id}.svg`).toSorted(),
  )
})

it('accepts the current Battlemaster detail identity', async () => {
  const catalogKey = 'pinned catalog'
  const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
  const owner = '01234567-89ab-cdef-0123-456789abcdef'
  const updatedAt = '2026-08-12 20:32:30.796047+00'
  sources.battlemaster.revision = hash(catalogKey)
  vi.stubGlobal(
    'fetch',
    vi.fn<(url: string | URL) => Promise<Response>>(async (url) =>
      String(url).includes('/v1.1/public/tts/layouts')
        ? new Response(
            JSON.stringify({
              catalogKey,
              layouts: [{ id, owner, ownerUsername: 'superwutz', name: 'Test layout', updatedAt, layoutKey: `${id}@${updatedAt}` }],
            }),
          )
        : new Response(
            JSON.stringify({
              format: 'battlemaster.data.layout',
              layout: {
                name: 'Test layout',
                owner: 'superwutz',
                updatedAt,
                layoutKey: '76fdff708ff2926a',
                links: { page: `https://battlemaster.online/community/layout/${owner}/${id}` },
              },
              terrain: [],
            }),
          ),
    ),
  )

  await syncSources(directory, sources)

  expect(fs.existsSync(path.join(directory, 'battlemaster', 'layouts', `${id}.json`))).toBe(true)
})

it('extracts the Game Datacards 11th edition data without other editions', async () => {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ ...revisions, datacards: 'old' }))
  const archive = zipSync({
    'repository/11th/gdc/core.json': new TextEncoder().encode('{}'),
    'repository/10th/gdc/core.json': new TextEncoder().encode('{}'),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn<(url: string | URL) => Promise<Response>>(async (url) =>
      String(url).includes('codeload.github.com') ? new Response(archive) : new Response('changed export'),
    ),
  )

  await syncSources(directory, sources)

  expect(fs.existsSync(path.join(directory, 'datacards', '11th', 'gdc', 'core.json'))).toBe(true)
  expect(fs.existsSync(path.join(directory, 'datacards', '10th'))).toBe(false)
})

it('overlays a newly pinned Marine codex without changing the BSData files', async () => {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ ...revisions, marineCodex: 'old' }))
  fs.writeFileSync(path.join(directory, 'definitions', 'shared.json'), '{}')
  const archive = zipSync(
    Object.fromEntries(
      (sources.marineCodex.files ?? []).map((file) => [`repository/${file}`, new TextEncoder().encode('{"revision":"new"}')]),
    ),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(archive)),
  )

  await syncSources(directory, sources)

  expect({
    codex: fs.readFileSync(path.join(directory, 'definitions', sources.marineCodex.files![0]!), 'utf8'),
    shared: fs.readFileSync(path.join(directory, 'definitions', 'shared.json'), 'utf8'),
  }).toEqual({ codex: '{"revision":"new"}', shared: '{}' })
})

it('keeps the current source when an archive lacks its configured subpath', async () => {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ ...revisions, datacards: 'old' }))
  fs.writeFileSync(path.join(directory, 'datacards', 'current.json'), '{}')
  const archive = zipSync({ 'repository/tools/package.json': new TextEncoder().encode('{}') })
  vi.stubGlobal(
    'fetch',
    vi.fn<() => Promise<Response>>(async () => new Response(archive)),
  )

  await expect(syncSources(directory, sources)).rejects.toThrow('archive contains no files under 11th/gdc')

  expect(fs.existsSync(path.join(directory, 'datacards', 'current.json'))).toBe(true)
})

it('removes disabled sources without fetching them', async () => {
  fs.mkdirSync(path.join(directory, 'battlemaster', 'layouts'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'battlemaster', 'layouts', 'test.json'), '{}')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)

  await syncSources(directory, sources, undefined, new Set(['datacards', 'battlemaster']))

  expect(fs.existsSync(path.join(directory, 'datacards'))).toBe(false)
  expect(fs.existsSync(path.join(directory, 'battlemaster'))).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})
