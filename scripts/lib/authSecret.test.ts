import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { existingAuthSecret } from './authSecret'

it('uses the configured auth secret without reading the data directory', async () => {
  expect(await existingAuthSecret({ AUTH_SECRET: ' configured-secret ', DATA_DIR: '/missing' })).toBe('configured-secret')
})

it('reads the existing auth secret without generating a replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'praetorium-auth-'))
  try {
    await writeFile(join(directory, 'auth.secret'), ' stored-secret \n')
    expect(await existingAuthSecret({ DATA_DIR: directory })).toBe('stored-secret')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects a missing auth secret', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'praetorium-auth-'))
  try {
    await expect(existingAuthSecret({ DATA_DIR: directory })).rejects.toThrow('ENOENT')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
