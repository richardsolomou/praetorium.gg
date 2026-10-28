import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { refreshLiveCatalogue } from './liveCatalogue'
import { liveCatalogueRevision } from '../../src/server/liveCatalogue'

const directories: string[] = []
const root = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-catalogue-'))
  directories.push(directory)
  return directory
}
const first = 'a'.repeat(64)
const second = 'b'.repeat(64)
function prepared(directory: string, id: string) {
  for (const file of ['catalogue/revision.json', 'runtime/manifest.json', 'public/offline-reference-version.json']) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    fs.writeFileSync(path.join(directory, file), JSON.stringify({ id }))
  }
  return id
}
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

it('keeps the old revision visible until the full replacement is ready', async () => {
  const directory = root()
  await refreshLiveCatalogue(directory, async (staging) => prepared(staging, first))
  let observed: string | undefined
  await refreshLiveCatalogue(directory, async (staging) => {
    observed = liveCatalogueRevision(directory)?.id
    return prepared(staging, second)
  })

  expect([observed, liveCatalogueRevision(directory)?.id]).toEqual([first, second])
})

it('keeps the old catalogue after an incomplete replacement', async () => {
  const directory = root()
  await refreshLiveCatalogue(directory, async (staging) => prepared(staging, first))
  await expect(refreshLiveCatalogue(directory, async () => second)).rejects.toThrow('Incomplete catalogue')

  expect(liveCatalogueRevision(directory)?.id).toBe(first)
})

it('releases a failed refresh so another attempt can succeed', async () => {
  const directory = root()
  await expect(
    refreshLiveCatalogue(directory, async () => {
      throw new Error('upstream unavailable')
    }),
  ).rejects.toThrow('upstream unavailable')
  await refreshLiveCatalogue(directory, async (staging) => prepared(staging, second))

  expect(liveCatalogueRevision(directory)?.id).toBe(second)
})

it('allows only one replica to prepare an update at a time', async () => {
  const directory = root()
  let competing: boolean | undefined
  await refreshLiveCatalogue(directory, async (staging) => {
    competing = await refreshLiveCatalogue(directory, async () => {
      throw new Error('second replica must not prepare')
    })
    return prepared(staging, first)
  })

  expect(competing).toBe(false)
})

it('prepares a new compiler while an older one is still preparing', async () => {
  const directory = root()
  let competing: boolean | undefined
  await refreshLiveCatalogue(path.join(directory, 'old-code'), async (staging) => {
    competing = await refreshLiveCatalogue(path.join(directory, 'new-code'), async (next) => prepared(next, second))
    return prepared(staging, first)
  })

  expect(competing).toBe(true)
})

it('does not publish a revision when the source heads have not changed', async () => {
  const directory = root()
  await refreshLiveCatalogue(directory, async (staging) => prepared(staging, first))

  expect(await refreshLiveCatalogue(directory, async () => null)).toBe(false)
})
