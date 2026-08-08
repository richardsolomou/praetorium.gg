import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import sources from '../../catalogue/sources.json' with { type: 'json' }
import { isCurrent, syncSources } from './sync'

let directory: string

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
