import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

function objectPath(root: string, key: string) {
  if (!path.isAbsolute(root) || !key || key.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
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
    return { bytes, httpEtag: `"${createHash('sha256').update(bytes).digest('hex')}"` }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
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
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
      } finally {
        await rm(temporary, { force: true })
      }
    },
  }
}
