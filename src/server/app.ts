import path from 'node:path'
import { type BattleEvents, createBattleEvents } from '../adapters/events'
import { type LoadedCatalogue, loadCatalogue } from './catalogue'
import { type LoadedRules, loadRules } from './rules'
import { databasePath, type MusterDatabase, openDatabase } from '../db/connection'
import { Repository } from '../db/repository'
import { sessionSecret } from './identity'
import { Presence } from './presence'
import { MusterService } from './service'

type App = {
  database: MusterDatabase
  service: MusterService
  events: BattleEvents
  presence: Presence
  secret: string
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
}

/** Parsing the whole catalogue takes seconds, so it happens once and only if asked for. */
function memoize<T>(work: () => T): () => T {
  let done = false
  let value: T
  return () => {
    if (!done) {
      value = work()
      done = true
    }
    return value
  }
}

// Dev keeps the instance on globalThis so HMR reloads reuse one SQLite handle.
const globalApp = globalThis as typeof globalThis & { musterApp?: App }

export function app(): App {
  if (!globalApp.musterApp) {
    const file = databasePath()
    const database = openDatabase(file)
    const events = createBattleEvents()
    globalApp.musterApp = {
      database,
      service: new MusterService(new Repository(database), Date.now, events),
      events,
      presence: new Presence(),
      secret: sessionSecret(path.dirname(file)),
      catalogue: memoize(loadCatalogue),
      rules: memoize(loadRules),
    }
  }
  return globalApp.musterApp
}
