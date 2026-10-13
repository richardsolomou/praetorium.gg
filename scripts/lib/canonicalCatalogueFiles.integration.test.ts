import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

it('writes the compiled catalogue to the requested output instead of the input snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-canonical-files-'))
  roots.push(root)
  const input = path.join(root, 'catalogue')
  const output = path.join(root, 'output', 'catalogue.json')
  fs.mkdirSync(path.join(input, 'definitions'), { recursive: true })
  fs.writeFileSync(path.join(input, 'definitions', 'catalogue.json'), '{"catalogue":{"id":"cat","name":"Test"}}\n')
  fs.writeFileSync(
    path.join(input, 'definitions', 'system.json'),
    '{"gameSystem":{"id":"gs","name":"Test","costTypes":[{"id":"pts","name":"pts"}]}}\n',
  )
  fs.writeFileSync(path.join(input, 'revision.json'), '{"definitions":"definitions-revision"}\n')

  execFileSync('pnpm', ['catalogue:compile'], {
    env: { ...process.env, CATALOGUE_DIR: input, CATALOGUE_CANONICAL_FILE: output },
  })

  expect(fs.existsSync(output)).toBe(true)
  expect(fs.existsSync(path.join(input, 'canonical', 'catalogue.json'))).toBe(false)
})
