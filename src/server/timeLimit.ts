import { createContext, Script } from 'node:vm'

const run = new Script('work()')

/**
 * Runs synchronous work, stopping it with a thrown error once it has held the thread for `ms`. Only work with nothing
 * to leave half-written belongs here, since it stops wherever it happens to be, a backtracking pattern included.
 */
export function withinTime<T>(ms: number, work: () => T): T {
  return run.runInContext(createContext({ work }), { timeout: ms }) as T
}
