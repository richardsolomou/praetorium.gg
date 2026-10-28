import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { privateR2Client } from '../../src/server/r2Client'

const execute = promisify(execFile)
const TARGET = /^(?:production|staging)$/

type Store = { client: { fetch: (url: string, init?: RequestInit) => Promise<Response> }; base: string }

/** The catalogue authoring configuration an archive was materialized with, and its live revision's source key. */
export type LiveCatalogueVersion = { authoring: string; sources: string }

function liveObject(target: string, r2: Store | null) {
  if (!TARGET.test(target)) throw new Error(`Unknown live catalogue target ${target}`)
  if (!r2) throw new Error('The live catalogue needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY')
  return { fetch: r2.client.fetch.bind(r2.client), url: `${r2.base}catalogue/live/${target}.tar.gz` }
}

function storedVersion(headers: Headers): LiveCatalogueVersion | null {
  const authoring = headers.get('x-amz-meta-authoring')
  const sources = headers.get('x-amz-meta-sources')
  return authoring && sources ? { authoring, sources } : null
}

const sameVersion = (left: LiveCatalogueVersion | null, right: LiveCatalogueVersion | null) =>
  Boolean(left && right && left.authoring === right.authoring && left.sources === right.sources)

/**
 * Publishes a live catalogue to the private bucket, where a release's new replica starts from it. `base` is the version
 * it was refreshed from: when another refresh has replaced that version since, the archive is left alone rather than
 * risk putting older sources over newer ones.
 */
export async function publishLiveCatalogue(
  directory: string,
  target: string,
  version: LiveCatalogueVersion,
  base: LiveCatalogueVersion | null,
  r2: Store | null = privateR2Client(),
) {
  const object = liveObject(target, r2)
  const head = await object.fetch(object.url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) })
  if (!head.ok && head.status !== 404) throw new Error(`Live catalogue lookup failed with HTTP ${head.status}`)
  const stored = head.ok ? storedVersion(head.headers) : null
  if (sameVersion(stored, version)) return 'unchanged'
  if (stored && !sameVersion(stored, base)) return 'superseded'
  const etag = head.ok ? head.headers.get('etag') : null
  const archive = path.join(os.tmpdir(), `praetorium-live-catalogue-${process.pid}.tar.gz`)
  try {
    await execute('tar', ['-czf', archive, '-C', directory, '.'])
    const response = await object.fetch(object.url, {
      method: 'PUT',
      body: fs.readFileSync(archive),
      headers: {
        'content-type': 'application/gzip',
        'x-amz-meta-authoring': version.authoring,
        'x-amz-meta-sources': version.sources,
        // R2 applies the condition atomically, so a publish racing this one cannot be overwritten.
        ...(head.ok ? (etag ? { 'if-match': etag } : {}) : { 'if-none-match': '*' }),
      },
      signal: AbortSignal.timeout(600_000),
    })
    if (response.status === 412) return 'superseded'
    if (!response.ok) throw new Error(`Live catalogue upload failed with HTTP ${response.status}`)
    return 'published'
  } finally {
    fs.rmSync(archive, { force: true })
  }
}

/**
 * The version of a target's published live catalogue, or null when it has none (or one published without a version).
 * The catalogue is unpacked into `directory` only when it was materialized with `authoring`.
 */
export async function fetchLiveCatalogue(target: string, directory: string, authoring: string, r2: Store | null = privateR2Client()) {
  const object = liveObject(target, r2)
  const response = await object.fetch(object.url, { signal: AbortSignal.timeout(600_000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Live catalogue download failed with HTTP ${response.status}`)
  const version = storedVersion(response.headers)
  if (version?.authoring !== authoring) {
    await response.body?.cancel()
    return version
  }
  const archive = path.join(os.tmpdir(), `praetorium-live-catalogue-${process.pid}.tar.gz`)
  try {
    fs.writeFileSync(archive, new Uint8Array(await response.arrayBuffer()))
    fs.mkdirSync(directory, { recursive: true })
    await execute('tar', ['-xzf', archive, '-C', directory, '--no-same-owner'])
    return version
  } finally {
    fs.rmSync(archive, { force: true })
  }
}
