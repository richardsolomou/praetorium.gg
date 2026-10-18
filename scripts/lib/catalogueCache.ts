import os from 'node:os'
import path from 'node:path'

/**
 * The per-user cache every worktree shares. `CATALOGUE_CACHE_DIR` names the snapshot cache itself,
 * other caches sit beside it, and `off` keeps everything inside the worktree.
 */
export function catalogueCacheRoot(name: 'catalogues' | 'runtime' | 'offline-reference') {
  const shared = process.env.CATALOGUE_CACHE_DIR?.trim()
  if (shared === 'off') return null
  if (shared) return name === 'catalogues' ? path.resolve(shared) : path.join(path.dirname(path.resolve(shared)), name)
  return path.join(process.env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), '.cache'), 'praetorium', name)
}
