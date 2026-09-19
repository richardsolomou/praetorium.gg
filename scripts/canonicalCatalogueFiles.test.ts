import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalCatalogueInputDirectory, canonicalCatalogueOutputFile } from './canonicalCatalogueFiles'

const originalDirectory = process.env.CATALOGUE_DIR
const originalFile = process.env.CATALOGUE_CANONICAL_FILE
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  if (originalDirectory === undefined) delete process.env.CATALOGUE_DIR
  else process.env.CATALOGUE_DIR = originalDirectory
  if (originalFile === undefined) delete process.env.CATALOGUE_CANONICAL_FILE
  else process.env.CATALOGUE_CANONICAL_FILE = originalFile
})

describe('canonical catalogue files', () => {
  it('defaults outside the activated catalogue snapshot', () => {
    delete process.env.CATALOGUE_DIR
    delete process.env.CATALOGUE_CANONICAL_FILE
    const root = path.join(import.meta.dirname, '..')

    expect([canonicalCatalogueInputDirectory(), canonicalCatalogueOutputFile()]).toEqual([
      path.join(root, 'catalogue-data'),
      path.join(root, '.output', 'canonical-catalogue.json'),
    ])
  })

  it('honours explicit input and output paths', () => {
    process.env.CATALOGUE_DIR = '/tmp/praetorium-input'
    process.env.CATALOGUE_CANONICAL_FILE = '/tmp/praetorium-output.json'

    expect([canonicalCatalogueInputDirectory(), canonicalCatalogueOutputFile()]).toEqual([
      '/tmp/praetorium-input',
      '/tmp/praetorium-output.json',
    ])
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
})
