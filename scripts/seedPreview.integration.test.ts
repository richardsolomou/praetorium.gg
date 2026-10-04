import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('runs the seed entry point through a symlink and retains its preview guard', async () => {
  const directory = mkdtempSync('/tmp/praetorium-seed-entry-')
  const entry = path.join(directory, 'seed.ts')
  symlinkSync(path.join(import.meta.dirname, 'seedPreview.ts'), entry)
  try {
    await expect(
      promisify(execFile)(process.execPath, ['--import', 'tsx', entry], {
        env: { ...process.env, PRAETORIUM_SEED_PREVIEW: 'false' },
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining('Refusing to seed a database without the preview flag') })
  } finally {
    rmSync(directory, { recursive: true })
  }
})
