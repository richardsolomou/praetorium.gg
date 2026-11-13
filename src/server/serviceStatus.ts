import { setTimeout } from 'node:timers/promises'
import { version } from '../../package.json'
import type { ServiceStatus } from '../contracts/serviceStatus'
import { app } from './app'
import { readCatalogueComposition } from './catalogueComposition'
import { catalogueDirectory } from './catalogueIndex'
import { installedSnapshot } from './catalogueSnapshot'

/** A starting server waits on its catalogue inside the health check, and the status page answers before then. */
const HEALTH_TIMEOUT_MS = 5_000
/** Anyone may ask, so one answer serves every reader for a while instead of probing the databases per request. */
const REUSE_MS = 15_000

let latest: { at: number; status: Promise<ServiceStatus> } | undefined

function passes(check: () => Promise<void>) {
  const timedOut = setTimeout(HEALTH_TIMEOUT_MS, undefined, { ref: false }).then(() => {
    throw new Error('health check timed out')
  })
  return Promise.race([check(), timedOut]).then(
    () => true,
    () => false,
  )
}

function rulesVersions(directory: string): ServiceStatus['rulesVersions'] {
  try {
    return (readCatalogueComposition(directory)?.editions ?? [])
      .filter(({ edition }) => edition.status !== 'retired')
      .map(({ edition }) => ({ name: edition.name, status: edition.status, default: edition.default }))
  } catch {
    return []
  }
}

async function read(): Promise<ServiceStatus> {
  const instance = app()
  const directory = catalogueDirectory()
  return {
    up: await passes(instance.health),
    release: version,
    commit: process.env.GITHUB_SHA?.trim() || null,
    catalogue: { sync: instance.sync().status, snapshot: installedSnapshot(directory)?.id ?? null },
    rulesVersions: rulesVersions(directory),
  }
}

export function serviceStatus() {
  if (!latest || Date.now() - latest.at > REUSE_MS) latest = { at: Date.now(), status: read() }
  return latest.status
}
