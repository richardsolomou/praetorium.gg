import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { catalogueRuntimeFingerprint } from '../../src/server/catalogueRuntime'
import { privateR2Client } from '../../src/server/r2Client'
import { referenceBundleKey } from './offlineReferenceCache'

const execute = promisify(execFile)
const TARGET = /^(?:production|staging)$/

type Store = { client: { fetch: (url: string, init?: RequestInit) => Promise<Response> }; base: string }

function liveObject(target: string, r2: Store | null) {
  if (!TARGET.test(target)) throw new Error(`Unknown live catalogue target ${target}`)
  if (!r2) throw new Error('The live catalogue needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY')
  return { fetch: r2.client.fetch.bind(r2.client), url: `${r2.base}catalogue/live/${target}.tar.gz` }
}

/** Everything prepared outputs read from a catalogue, so an unchanged catalogue is not uploaded again. */
const sourcesIdentity = (directory: string) => referenceBundleKey(directory, catalogueRuntimeFingerprint(directory))

/**
 * Publishes a deployment's live catalogue to the private bucket, where a release prepares it for
 * its own compiler before replicas change. `marker` records the last catalogue published.
 */
export async function publishLiveCatalogue(directory: string, target: string, marker: string, r2: Store | null = privateR2Client()) {
  const identity = sourcesIdentity(directory)
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === identity) return 'unchanged'
  const object = liveObject(target, r2)
  const archive = path.join(os.tmpdir(), `praetorium-live-catalogue-${process.pid}.tar.gz`)
  try {
    await execute('tar', ['-czf', archive, '-C', directory, '.'])
    const response = await object.fetch(object.url, {
      method: 'PUT',
      body: fs.readFileSync(archive),
      headers: { 'content-type': 'application/gzip' },
      signal: AbortSignal.timeout(600_000),
    })
    if (!response.ok) throw new Error(`Live catalogue upload failed with HTTP ${response.status}`)
    fs.writeFileSync(marker, identity)
    return 'published'
  } finally {
    fs.rmSync(archive, { force: true })
  }
}

/** Unpacks a target's published live catalogue into `directory`; false when it has published none. */
export async function fetchLiveCatalogue(target: string, directory: string, r2: Store | null = privateR2Client()) {
  const object = liveObject(target, r2)
  const response = await object.fetch(object.url, { signal: AbortSignal.timeout(600_000) })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`Live catalogue download failed with HTTP ${response.status}`)
  const archive = path.join(os.tmpdir(), `praetorium-live-catalogue-${process.pid}.tar.gz`)
  try {
    fs.writeFileSync(archive, new Uint8Array(await response.arrayBuffer()))
    fs.mkdirSync(directory, { recursive: true })
    await execute('tar', ['-xzf', archive, '-C', directory, '--no-same-owner'])
    return true
  } finally {
    fs.rmSync(archive, { force: true })
  }
}
