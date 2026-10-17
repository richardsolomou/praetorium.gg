import { app } from './app'

const MEMO_LIMIT = 300
const memo = new Map<string, Promise<unknown>>()
let memoRevision: string | undefined

export const snapshotRevision = () => process.env.CATALOGUE_SNAPSHOT_ID ?? app().catalogue()?.index.revision

/**
 * One computed answer per input for every reader until the catalogue snapshot changes.
 *
 * Server-rendered reference pages call their reads in process, so HTTP caching never reaches them; a crawler
 * rendering a faction's datasheets one after another otherwise recomputes the same faction list for each page.
 * Answers are shared between callers and must not be mutated.
 */
export function memoUntilSnapshotChanges<T>(scope: string, input: unknown, compute: () => Promise<T>): Promise<T> {
  const revision = snapshotRevision()
  if (!revision) return compute()
  if (revision !== memoRevision) {
    memo.clear()
    memoRevision = revision
  }
  const key = `${scope}:${JSON.stringify(input)}`
  const held = memo.get(key) as Promise<T> | undefined
  if (held) {
    memo.delete(key)
    memo.set(key, held)
    return held
  }
  const pending = compute().catch((error: unknown) => {
    memo.delete(key)
    throw error
  })
  memo.set(key, pending)
  if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value!)
  return pending
}
