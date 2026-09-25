import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { writeAuthBundle } from './authBundle'

it('writes a private auth bundle outside the repository', async () => {
  const base = await mkdtemp(join(tmpdir(), 'praetorium-export-'))
  try {
    const repository = join(base, 'repository')
    const destination = join(base, 'bundle')
    await mkdir(repository)
    await writeAuthBundle(destination, 'SELECT 1;\n', 'existing-secret', repository)

    expect(await readFile(join(destination, 'auth.secret'), 'utf8')).toBe('existing-secret\n')
    expect(await readFile(join(destination, 'auth.sql'), 'utf8')).toBe('SELECT 1;\n')
    expect((await stat(destination)).mode & 0o077).toBe(0)
    expect((await stat(join(destination, 'auth.secret'))).mode & 0o077).toBe(0)
    expect((await stat(join(destination, 'auth.sql'))).mode & 0o077).toBe(0)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

it('refuses to put an auth bundle in the repository', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'praetorium-export-repository-'))
  try {
    await expect(writeAuthBundle(join(repository, 'bundle'), '', 'secret', repository)).rejects.toThrow('outside the repository')
  } finally {
    await rm(repository, { recursive: true, force: true })
  }
})

it('refuses to replace an existing auth bundle', async () => {
  const base = await mkdtemp(join(tmpdir(), 'praetorium-export-'))
  try {
    const repository = join(base, 'repository')
    const destination = join(base, 'bundle')
    await mkdir(repository)
    await writeAuthBundle(destination, 'original', 'original-secret', repository)
    await expect(writeAuthBundle(destination, 'replacement', 'replacement-secret', repository)).rejects.toThrow('EEXIST')
    expect(await readFile(join(destination, 'auth.sql'), 'utf8')).toBe('original')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
