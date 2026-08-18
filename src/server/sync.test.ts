import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalogueSources as config, type ResolvedCatalogueSources } from './catalogueSources'
import { isCurrent, syncSources } from './sync'

let directory: string
let sources: ResolvedCatalogueSources
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

beforeEach(() => {
  sources = {
    definitions: { ...config.definitions, revision: 'definitions-revision' },
    points: { ...config.points, revision: 'points-revision' },
    rules: { ...config.rules, revision: 'rules-revision' },
    datacards: { ...config.datacards, revision: 'datacards-revision' },
    battlemaster: { ...config.battlemaster, revision: 'battlemaster-revision' },
    wahapedia: { ...config.wahapedia, revision: 'wahapedia-revision', files: {}, pages: {} },
  }
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-sync-'))
  for (const name of ['definitions', 'points', 'rules', 'datacards']) fs.mkdirSync(path.join(directory, name))
  fs.writeFileSync(
    path.join(directory, 'revision.json'),
    JSON.stringify({
      definitions: sources.definitions.revision,
      points: sources.points.revision,
      rules: sources.rules.revision,
      datacards: sources.datacards.revision,
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(directory, { recursive: true, force: true })
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

  await syncSources(directory, { ...sources, wahapedia: { ...sources.wahapedia, baseUrl: 'https://example.test' } })

  expect(fs.existsSync(path.join(directory, 'battlemaster', 'layouts', `${id}.json`))).toBe(true)
})

it('keeps the authoritative catalogue ready when optional descriptions change upstream', async () => {
  sources.wahapedia.files = { 'Descriptions.csv': hash('expected export') }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('changed export')),
  )
  const messages: string[] = []
  await syncSources(directory, sources, (message) => messages.push(message))
  expect(isCurrent(directory, sources) && messages.some((message) => message.startsWith('wahapedia: descriptions unavailable'))).toBe(true)
})

it('refetches a pinned export when a configured file is missing', async () => {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ ...revisions, wahapedia: sources.wahapedia.revision }))
  fs.mkdirSync(path.join(directory, 'wahapedia'))
  for (const name of Object.keys(sources.wahapedia.files).slice(1)) fs.writeFileSync(path.join(directory, 'wahapedia', name), '')
  const fetch = vi.fn<() => Promise<Response>>(async () => new Response('changed export'))
  vi.stubGlobal('fetch', fetch)

  await syncSources(directory, sources)

  expect(fetch).toHaveBeenCalled()
})

it('keeps verified exports when one optional live page changes', async () => {
  const exported = 'name|detachment|description|\nRule|Test|Description|\n'
  const fetch = vi.fn<(url: string) => Promise<Response>>(
    async (url) => new Response(url.endsWith('/Stratagems.csv') ? exported : 'changed page'),
  )
  vi.stubGlobal('fetch', fetch)
  const messages: string[] = []

  const withDescriptions: ResolvedCatalogueSources = {
    ...sources,
    wahapedia: {
      ...sources.wahapedia,
      baseUrl: 'https://example.test',
      revision: 'test revision',
      files: { 'Stratagems.csv': hash(exported) },
      pages: { faction: hash('pinned page') },
    },
  }
  await syncSources(directory, withDescriptions, (message) => messages.push(message))

  expect(fs.readFileSync(path.join(directory, 'wahapedia', 'Stratagems.csv'), 'utf8')).toBe(exported)
  expect(messages).toContain('wahapedia: descriptions unavailable for faction')
  const requests = fetch.mock.calls.length
  await syncSources(directory, withDescriptions)
  // Battlemaster remains retryable when its optional snapshot is unavailable.
  expect(fetch).toHaveBeenCalledTimes(requests + 1)
})

it('extracts only a source configured subpath', async () => {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ ...revisions, rules: 'old' }))
  const archive = zipSync({
    'repository/data/core/faction/rules.json': new TextEncoder().encode('{}'),
    'repository/tools/package.json': new TextEncoder().encode('{}'),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn<(url: string) => Promise<Response>>(async (url) =>
      url.includes('codeload.github.com') ? new Response(archive) : new Response('changed export'),
    ),
  )

  await syncSources(directory, sources)

  expect(fs.existsSync(path.join(directory, 'rules', 'data', 'core', 'faction', 'rules.json'))).toBe(true)
  expect(fs.existsSync(path.join(directory, 'rules', 'tools', 'package.json'))).toBe(false)
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
    vi.fn<(url: string) => Promise<Response>>(async (url) =>
      url.includes('codeload.github.com') ? new Response(archive) : new Response('changed export'),
    ),
  )

  await syncSources(directory, sources)

  expect(fs.existsSync(path.join(directory, 'datacards', '11th', 'gdc', 'core.json'))).toBe(true)
  expect(fs.existsSync(path.join(directory, 'datacards', '10th'))).toBe(false)
})

it('keeps the current source when an archive lacks its configured subpath', async () => {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ ...revisions, rules: 'old' }))
  fs.writeFileSync(path.join(directory, 'rules', 'current.json'), '{}')
  const archive = zipSync({ 'repository/tools/package.json': new TextEncoder().encode('{}') })
  vi.stubGlobal(
    'fetch',
    vi.fn<() => Promise<Response>>(async () => new Response(archive)),
  )

  await expect(syncSources(directory, sources)).rejects.toThrow('archive contains no files under data/core')

  expect(fs.existsSync(path.join(directory, 'rules', 'current.json'))).toBe(true)
})
