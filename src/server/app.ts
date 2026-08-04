import path from 'node:path'
import { type BattleEvents, createBattleEvents } from '../adapters/events'
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
    }
  }
  return globalApp.musterApp
}
