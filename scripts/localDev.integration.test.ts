import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { reserveLocalPort } from './lib/localStack'

const execute = promisify(execFile)

it('refuses an existing test directory and preserves its data even when startup fails', async () => {
  const directory = `/tmp/praetorium-e2e-${randomUUID()}`
  await mkdir(directory)
  const sentinel = path.join(directory, 'existing-data')
  await writeFile(sentinel, 'belongs to another run')
  try {
    const result = await execute(process.execPath, ['scripts/localDev.ts'], {
      timeout: 2_000,
      killSignal: 'SIGTERM',
      env: { ...process.env, LOCAL_TEST_MODE: 'true', LOCAL_DATA_DIR: directory, SPACETIME_BIN: '/usr/bin/false' },
    }).catch((error: { stderr: string }) => error)
    expect([result.stderr.includes('Refusing to reset existing test data'), await readFile(sentinel, 'utf8')]).toEqual([
      true,
      'belongs to another run',
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('refuses an occupied readiness port before creating test data', async () => {
  const owner = await reserveLocalPort()
  const directory = `/tmp/praetorium-e2e-${randomUUID()}`
  try {
    const result = await execute(process.execPath, ['scripts/localDev.ts'], {
      timeout: 2_000,
      killSignal: 'SIGTERM',
      env: { ...process.env, LOCAL_TEST_MODE: 'true', LOCAL_DATA_DIR: directory, LOCAL_READY_PORT: String(owner.port) },
    }).catch((error: { stderr: string }) => error)
    expect(result.stderr).toContain('EADDRINUSE')
  } finally {
    await owner.release()
    await rm(directory, { recursive: true, force: true })
  }
})
