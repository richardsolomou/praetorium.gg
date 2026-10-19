import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { liveCatalogueRevision } from '../../src/server/liveCatalogue.ts'

export function holdCatalogueCache(root: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const directory = path.join(root, 'leases')
  fs.mkdirSync(directory, { recursive: true })
  const lease = path.join(directory, randomUUID())
  fs.writeFileSync(lease, '')
  const timer = setInterval(() => {
    try {
      const now = new Date()
      fs.utimesSync(lease, now, now)
    } catch (error) {
      console.error({ event: 'catalogue_cache_lease_failed', error })
    }
  }, 60_000)
  timer.unref()
  const stop = () => clearInterval(timer)
  signal.addEventListener('abort', stop, { once: true })
  return stop
}

function caches(root: string) {
  const parent = path.dirname(root)
  return fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))
    .map((entry) => path.join(parent, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
}

function retainedRevision(root: string) {
  try {
    const current = liveCatalogueRevision(root)
    return current && fs.statSync(path.join(current.directory, 'catalogue/revision.json'), { throwIfNoEntry: false })?.isFile()
      ? current
      : null
  } catch (error) {
    console.error({ event: 'catalogue_cache_refused', directory: root, error })
    return null
  }
}

export function retainedCatalogueCache(root: string, authoring: string) {
  for (const candidate of caches(root)) {
    if (candidate === root || !fs.existsSync(path.join(candidate, 'authoring'))) continue
    if (fs.readFileSync(path.join(candidate, 'authoring'), 'utf8') !== authoring) continue
    const current = retainedRevision(candidate)
    if (current) return { root: candidate, directory: path.join(current.directory, 'catalogue') }
  }
  return null
}

export function pruneCatalogueCaches(root: string, now = Date.now()) {
  const inactive = caches(root).filter((candidate) => {
    if (candidate === root) return false
    const leases = path.join(candidate, 'leases')
    return (
      !fs.existsSync(leases) || fs.readdirSync(leases).every((name) => now - fs.statSync(path.join(leases, name)).mtimeMs > 10 * 60_000)
    )
  })
  const retained = new Set(inactive.filter((candidate) => retainedRevision(candidate)).slice(0, 2))
  for (const candidate of inactive) if (!retained.has(candidate)) fs.rmSync(candidate, { recursive: true, force: true })
}
