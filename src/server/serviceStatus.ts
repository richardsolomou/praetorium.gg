import path from 'node:path'
import { version } from '../../package.json'
import type { ServiceStatus } from '../contracts/serviceStatus'
import { app } from './app'
import { readCatalogueComposition } from './catalogueComposition'
import { catalogueDirectory } from './catalogueIndex'
import { readSnapshotPointer } from './catalogueSnapshot'

/** A starting server waits on its catalogue inside the health check, and the status page answers before then. */
const HEALTH_TIMEOUT_MS = 5_000

async function passes(check: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('health check timed out')), HEALTH_TIMEOUT_MS)
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function attempt<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

export async function serviceStatus(): Promise<ServiceStatus> {
  const instance = app()
  const directory = catalogueDirectory()
  return {
    up: await passes(instance.health),
    release: version,
    commit: process.env.GITHUB_SHA?.trim() || null,
    catalogue: {
      sync: instance.sync().status,
      snapshot: attempt(() => readSnapshotPointer(path.join(directory, '.snapshot.json')).id),
    },
    rulesVersions: (attempt(() => readCatalogueComposition(directory))?.editions ?? []).flatMap(({ edition }) =>
      edition.status === 'retired' ? [] : [{ name: edition.name, status: edition.status, default: edition.default }],
    ),
  }
}
