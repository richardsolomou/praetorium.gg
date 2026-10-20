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

/**
 * The source data a new compiler prepares from: the revision last published for releases when a cache holds it, so the
 * release's prepared outputs match, otherwise the newest working cache with the same authoring configuration.
 */
export function retainedCatalogueCache(root: string, authoring: string) {
  const published = path.join(path.dirname(root), 'live-sources')
  const wanted = fs.existsSync(published) ? fs.readFileSync(published, 'utf8') : null
  const usable = caches(root).flatMap((candidate) => {
    if (candidate === root || !fs.existsSync(path.join(candidate, 'authoring'))) return []
    if (fs.readFileSync(path.join(candidate, 'authoring'), 'utf8') !== authoring) return []
    const current = retainedRevision(candidate)
    return current ? [{ root: candidate, directory: path.join(current.directory, 'catalogue'), revision: current.directory }] : []
  })
  const sourcesOf = (revision: string) => {
    try {
      return (JSON.parse(fs.readFileSync(path.join(revision, 'sources.json'), 'utf8')) as { key?: unknown }).key
    } catch {
      return undefined
    }
  }
  const chosen = (wanted && usable.find((candidate) => sourcesOf(candidate.revision) === wanted)) || usable[0]
  return chosen ? { root: chosen.root, directory: chosen.directory } : null
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
