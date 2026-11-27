import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Praetorium's directory in the per-user cache. */
export const userCacheRoot = () => path.join(process.env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), '.cache'), 'praetorium')

/**
 * The per-user cache every worktree shares. `CATALOGUE_CACHE_DIR` names the snapshot cache itself,
 * other caches sit beside it, and `off` keeps everything inside the worktree.
 */
export function catalogueCacheRoot(name: 'catalogues' | 'runtime' | 'offline-reference') {
  const shared = process.env.CATALOGUE_CACHE_DIR?.trim()
  if (shared === 'off') return null
  if (shared) return name === 'catalogues' ? path.resolve(shared) : path.join(path.dirname(path.resolve(shared)), name)
  return path.join(userCacheRoot(), name)
}

const UNUSED_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000

/** Marks a cache entry as used so `pruneUnusedEntries` keeps it. */
export function touchEntry(entry: string) {
  const now = new Date()
  fs.utimesSync(entry, now, now)
}

/** Removes entries of a content-addressed cache that nothing has written or restored for three days. */
export function pruneUnusedEntries(root: string) {
  if (!fs.existsSync(root)) return
  for (const name of fs.readdirSync(root)) {
    const entry = path.join(root, name)
    try {
      if (Date.now() - fs.lstatSync(entry).mtimeMs > UNUSED_LIFETIME_MS) fs.rmSync(entry, { recursive: true, force: true })
    } catch {
      // Another build pruned or replaced it first.
    }
  }
}
