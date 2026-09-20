import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

it('validates an explicitly configured catalogue sources file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-catalogue-config-'))
  const sources = path.join(root, 'sources.json')
  fs.writeFileSync(sources, '{}\n')
  try {
    expect(() =>
      execFileSync('pnpm', ['catalogue:check'], {
        env: { ...process.env, CATALOGUE_SOURCES_FILE: sources },
        stdio: 'pipe',
      }),
    ).toThrow()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
