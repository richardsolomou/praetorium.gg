import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { holdCatalogueCache, retainedCatalogueCache, pruneCatalogueCaches } from './catalogueCacheLease'

const directories: string[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})
function fixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-catalogue-leases-'))
  directories.push(parent)
  const cache = (number: number, authoring = 'compatible') => {
    const root = path.join(parent, number.toString(16).repeat(64))
    fs.mkdirSync(path.join(root, 'f'.repeat(64), 'catalogue'), { recursive: true })
    fs.writeFileSync(path.join(root, 'f'.repeat(64), 'catalogue/revision.json'), '{}')
    fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({ id: 'f'.repeat(64) }))
    fs.writeFileSync(path.join(root, 'authoring'), authoring)
    fs.utimesSync(root, new Date(number * 1_000), new Date(number * 1_000))
    return root
  }
  return { parent, cache }
}

it('reuses the most recent working source data only when its authoring configuration matches', () => {
  const { cache } = fixture()
  const current = cache(1)
  const previous = cache(2)
  cache(3, 'different rules configuration')

  expect(retainedCatalogueCache(current, 'compatible')).toEqual({
    root: previous,
    directory: path.join(previous, 'f'.repeat(64), 'catalogue'),
  })
})

it('skips an incomplete cache when looking for source data for a new compiler', () => {
  const { cache } = fixture()
  const current = cache(1)
  const previous = cache(2)
  const incomplete = cache(3)
  fs.rmSync(path.join(incomplete, 'f'.repeat(64)), { recursive: true })

  expect(retainedCatalogueCache(current, 'compatible')?.root).toBe(previous)
})

it('retains active replicas and two rollback caches, then reclaims a cache after its lease expires', () => {
  const { parent, cache } = fixture()
  const current = cache(1)
  const active = cache(2)
  for (const number of [3, 4, 5, 6]) cache(number)
  const abort = new AbortController()
  holdCatalogueCache(active, abort.signal)
  fs.utimesSync(active, new Date(2_000), new Date(2_000))
  pruneCatalogueCaches(current)
  const live = fs.readdirSync(parent).sort()
  const lease = path.join(active, 'leases', fs.readdirSync(path.join(active, 'leases'))[0]!)
  abort.abort()
  fs.utimesSync(lease, new Date(0), new Date(0))
  pruneCatalogueCaches(current)

  expect({ live, expired: fs.existsSync(active), current: fs.existsSync(current) }).toEqual({
    live: [1, 2, 5, 6].map((number) => number.toString(16).repeat(64)),
    expired: false,
    current: true,
  })
})

it('renews a live cache lease and stops renewing after shutdown', () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  const { cache } = fixture()
  const root = cache(1)
  const abort = new AbortController()
  holdCatalogueCache(root, abort.signal)
  const lease = path.join(root, 'leases', fs.readdirSync(path.join(root, 'leases'))[0]!)
  fs.utimesSync(lease, new Date(0), new Date(0))
  vi.advanceTimersByTime(60_000)
  const renewed = fs.statSync(lease).mtimeMs
  abort.abort()
  vi.advanceTimersByTime(120_000)

  expect([renewed, fs.statSync(lease).mtimeMs]).toEqual([1_060_000, 1_060_000])
})
