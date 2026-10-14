import { isDeepStrictEqual } from 'node:util'

function projectionHashes(jsonl: string) {
  const hashes: Record<string, string> = {}
  for (const line of jsonl.trim().split('\n')) {
    const { projection, sha256 } = JSON.parse(line) as { projection?: string; sha256?: unknown }
    if (!projection) continue
    if (projection in hashes) throw new Error('Duplicate projection hashes')
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid projection hash')
    hashes[projection] = sha256
  }
  if (!Object.keys(hashes).length) throw new Error('No projection hashes were produced')
  return hashes
}

/** Source and runtime benchmark output must describe identical projections, in any order. */
export function assertMatchingProjections(source: string, runtime: string) {
  if (!isDeepStrictEqual(projectionHashes(source), projectionHashes(runtime))) throw new Error('Source and runtime projections differ')
}
