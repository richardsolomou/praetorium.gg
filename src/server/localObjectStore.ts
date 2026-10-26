import { hash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { errorHasCode } from 'ras-stack/server'
// scripts/nodeServer.ts runs this module under plain Node, which needs the extension.
import { isSafeRelativePath } from './relativePath.ts'

function objectPath(root: string, key: string) {
  if (!path.isAbsolute(root) || !isSafeRelativePath(key)) {
    throw new Error('Invalid local object key')
  }
  const file = path.resolve(root, key)
  if (path.relative(root, file).startsWith('..') || path.isAbsolute(path.relative(root, file))) {
    throw new Error('Invalid local object key')
  }
  return file
}

async function object(root: string, key: string) {
  try {
    const bytes = await readFile(objectPath(root, key))
    return { bytes, httpEtag: `"${hash('sha256', bytes)}"` }
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return null
    throw error
  }
}

export function localObjectStore(root: string) {
  if (!path.isAbsolute(root)) throw new Error('LOCAL_OBJECT_DIR must be absolute')
  return {
    async head(key: string) {
      const stored = await object(root, key)
      return stored && { httpEtag: stored.httpEtag }
    },
    async get(key: string) {
      const stored = await object(root, key)
      return stored && { httpEtag: stored.httpEtag, body: new Blob([new Uint8Array(stored.bytes)]).stream() }
    },
    async put(key: string, body: Uint8Array) {
      const file = objectPath(root, key)
      await mkdir(path.dirname(file), { recursive: true })
      const temporary = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, body, { flag: 'wx' })
        try {
          await link(temporary, file)
        } catch (error) {
          if (!errorHasCode(error, 'EEXIST')) throw error
        }
      } finally {
        await rm(temporary, { force: true })
      }
    },
    async delete(key: string) {
      await rm(objectPath(root, key), { force: true })
    },
  }
}

/** The on-disk store a local development stack uses in place of R2, shaped like `r2Objects`; null outside one. */
export function localDevelopmentObjects(environment: NodeJS.ProcessEnv) {
  if (environment.PRAETORIUM_LOCAL_DEV !== 'true') return null
  const root = environment.LOCAL_OBJECT_DIR
  if (!root) throw new Error('LOCAL_OBJECT_DIR is required for local development')
  const store = localObjectStore(root)
  return {
    head: async (key: string) => Boolean(await store.head(key)),
    get: async (key: string): Promise<Uint8Array | null> => (await object(root, key))?.bytes ?? null,
    put: (key: string, body: Uint8Array, _headers?: Record<string, string>) => store.put(key, body),
    delete: (key: string) => store.delete(key),
  }
}
