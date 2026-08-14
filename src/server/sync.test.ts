import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalogueSources as sources } from './catalogueSources'
import { isCurrent, syncSources } from './sync'

let directory: string
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-sync-'))
  for (const name of ['definitions', 'points', 'rules']) fs.mkdirSync(path.join(directory, name))
  fs.writeFileSync(
    path.join(directory, 'revision.json'),
    JSON.stringify({
      definitions: sources.definitions.revision,
      points: sources.points.revision,
      rules: sources.rules.revision,
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(directory, { recursive: true, force: true })
})

it('keeps the authoritative catalogue ready when optional descriptions change upstream', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('changed export')),
  )
  const messages: string[] = []
  await syncSources(directory, (message) => messages.push(message))
  expect(isCurrent(directory) && messages.some((message) => message.startsWith('wahapedia: descriptions unavailable'))).toBe(true)
})

it('refetches a pinned export when a configured file is missing', async () => {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ ...revisions, wahapedia: sources.wahapedia.revision }))
  fs.mkdirSync(path.join(directory, 'wahapedia'))
  for (const name of Object.keys(sources.wahapedia.files).slice(1)) fs.writeFileSync(path.join(directory, 'wahapedia', name), '')
  const fetch = vi.fn<() => Promise<Response>>(async () => new Response('changed export'))
  vi.stubGlobal('fetch', fetch)

  await syncSources(directory, () => {})

  expect(fetch).toHaveBeenCalled()
})

it('keeps verified exports when one optional live page changes', async () => {
  const exported = 'name|detachment|description|\nRule|Test|Description|\n'
  const fetch = vi.fn<(url: string) => Promise<Response>>(
    async (url) => new Response(url.endsWith('/Stratagems.csv') ? exported : 'changed page'),
  )
  vi.stubGlobal('fetch', fetch)
  const messages: string[] = []

  await syncSources(directory, (message) => messages.push(message), {
    baseUrl: 'https://example.test',
    revision: 'test revision',
    files: { 'Stratagems.csv': hash(exported) },
    pages: { faction: hash('pinned page') },
  })

  expect(fs.readFileSync(path.join(directory, 'wahapedia', 'Stratagems.csv'), 'utf8')).toBe(exported)
  expect(messages).toContain('wahapedia: descriptions unavailable for faction')
  const requests = fetch.mock.calls.length
  await syncSources(directory, () => {}, {
    baseUrl: 'https://example.test',
    revision: 'test revision',
    files: { 'Stratagems.csv': hash(exported) },
    pages: { faction: hash('pinned page') },
  })
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

  await syncSources(directory)

  expect(fs.existsSync(path.join(directory, 'rules', 'data', 'core', 'faction', 'rules.json'))).toBe(true)
  expect(fs.existsSync(path.join(directory, 'rules', 'tools', 'package.json'))).toBe(false)
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

  await expect(syncSources(directory)).rejects.toThrow('archive contains no files under data/core')

  expect(fs.existsSync(path.join(directory, 'rules', 'current.json'))).toBe(true)
})
