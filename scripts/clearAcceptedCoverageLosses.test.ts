import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

it('consumes accepted coverage losses for a release commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-accepted-coverage-losses-'))
  temporaryDirectories.push(root)
  const accepted = path.join(root, 'accepted-coverage-losses.json')
  fs.writeFileSync(accepted, '[{"reason":"expected","entries":["lost entry"]}]\n')

  execFileSync('pnpm', ['tsx', path.join(import.meta.dirname, 'clearAcceptedCoverageLosses.ts'), accepted])

  expect(fs.readFileSync(accepted, 'utf8')).toBe('[]\n')
})
