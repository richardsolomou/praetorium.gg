import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Unzip, UnzipInflate } from 'fflate'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { byteLimit } from './boundedBody'
import { isSafeRelativePath } from './relativePath'

export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
export const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024
/** Any one file a snapshot carries, other than its manifest. */
export const MAX_OBJECT_BYTES = 64 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 1024 * 1024
export const MAX_SNAPSHOT_FILES = 10_000

export type ExtractedFile = { sha256: string; bytes: number; file: string }

export function hashCatalogueFile(file: string) {
  const hash = createHash('sha256')
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(64 * 1024)
    let count: number
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count))
    return hash.digest('hex')
  } finally {
    fs.closeSync(fd)
  }
}

export async function downloadCatalogueObject(response: Response, file: string, expected: string) {
  if (!response.body) throw new Error('catalogue object has no body')
  const hash = createHash('sha256')
  const message = 'catalogue object is too large'
  await pipeline(
    Readable.from(response.body),
    byteLimit(MAX_OBJECT_BYTES, message),
    createGunzip(),
    byteLimit(MAX_OBJECT_BYTES, message, (chunk) => hash.update(chunk)),
    fs.createWriteStream(file, { flags: 'wx' }),
  )
  if (hash.digest('hex') !== expected) throw new Error('catalogue object checksum does not match')
}

export function extractCatalogueArchive(archive: string, directory: string) {
  const files = new Map<string, ExtractedFile>()
  const open = new Set<number>()
  const names = new Set<string>()
  const archiveHash = createHash('sha256')
  let expanded = 0
  const unzip = new Unzip((entry) => {
    const name = entry.name
    if (names.size >= MAX_SNAPSHOT_FILES || names.has(name)) throw new Error('catalogue snapshot has duplicate or excessive entries')
    names.add(name)
    if (name !== 'manifest.json' && !/^objects\/[a-f0-9]{64}$/.test(name) && !name.startsWith('catalogue/')) {
      throw new Error(`catalogue snapshot contains an unexpected entry ${name}`)
    }
    if (!isSafeRelativePath(name)) {
      throw new Error(`unsafe catalogue snapshot path ${name}`)
    }
    const file = path.join(directory, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const fd = fs.openSync(file, 'wx')
    open.add(fd)
    const hash = createHash('sha256')
    let bytes = 0
    entry.ondata = (error, chunk, final) => {
      if (error) throw error
      bytes += chunk.length
      expanded += chunk.length
      if (expanded > MAX_EXTRACTED_BYTES || bytes > (name === 'manifest.json' ? MAX_MANIFEST_BYTES : MAX_OBJECT_BYTES)) {
        throw new Error('catalogue snapshot expands beyond its size limit')
      }
      hash.update(chunk)
      fs.writeFileSync(fd, chunk)
      if (final) {
        fs.closeSync(fd)
        open.delete(fd)
        files.set(name, { sha256: hash.digest('hex'), bytes, file })
      }
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  const fd = fs.openSync(archive, 'r')
  try {
    const size = fs.fstatSync(fd).size
    if (size > MAX_ARCHIVE_BYTES) throw new Error('catalogue snapshot archive is too large')
    const buffer = Buffer.alloc(64 * 1024)
    let read = 0
    while (read < size) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (!count) throw new Error('catalogue snapshot archive is truncated')
      read += count
      const chunk = buffer.subarray(0, count)
      archiveHash.update(chunk)
      // Unzip retains input slices across headers; the file read buffer is reused.
      unzip.push(new Uint8Array(chunk), read === size)
    }
    if (files.size !== names.size || !files.has('manifest.json')) throw new Error('catalogue snapshot archive is incomplete')
    return { files, sha256: archiveHash.digest('hex') }
  } finally {
    fs.closeSync(fd)
    for (const entry of open) fs.closeSync(entry)
  }
}
