import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { publicObject } from '../../cloudflare/publicObjects'
import { localObjectStore } from './localObjectStore'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function bucket() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'praetorium-objects-'))
  directories.push(directory)
  return localObjectStore(directory)
}

it('serves a locally uploaded avatar through the public object allowlist', async () => {
  const objects = await bucket()
  const key = `avatars/${'a'.repeat(64)}.webp`
  await objects.put(key, new Uint8Array([1, 2, 3]))
  const response = await publicObject(new Request(`http://localhost/praetorium/${key}`), objects)
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
})

it('keeps local backup objects private', async () => {
  const objects = await bucket()
  await objects.put('backups/auth/private.zip', new Uint8Array([1]))
  const response = await publicObject(new Request('http://localhost/praetorium/backups/auth/private.zip'), objects)
  expect(response.status).toBe(404)
})

it('rejects paths outside the local object directory', async () => {
  const objects = await bucket()
  await expect(objects.put('../auth.sqlite', new Uint8Array([1]))).rejects.toThrow('Invalid local object key')
})
