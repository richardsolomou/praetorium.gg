import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { catalogueSources } from '../../src/server/catalogueSources'
import { applyPatches, overlayMarineCodex } from './cataloguePatches'

let root: string
let patches: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-patches-'))
  patches = path.join(root, 'patches')
  fs.mkdirSync(patches)
  fs.mkdirSync(path.join(root, 'definitions'))
  execFileSync('git', ['init', '--quiet', root])
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it('rejects a correction targeting another source', () => {
  fs.writeFileSync(
    path.join(patches, '001-other.patch'),
    'diff --git a/points/other.json b/points/other.json\nnew file mode 100644\n--- /dev/null\n+++ b/points/other.json\n@@ -0,0 +1 @@\n+{}\n',
  )

  expect(() => applyPatches(root, patches, 'definitions')).toThrow('outside definitions')
})

it('applies additions and dependent corrections in filename order', () => {
  fs.writeFileSync(
    path.join(patches, '001-add.patch'),
    'diff --git a/definitions/unit.json b/definitions/unit.json\nnew file mode 100644\n--- /dev/null\n+++ b/definitions/unit.json\n@@ -0,0 +1 @@\n+{"name":"Unit"}\n',
  )
  fs.writeFileSync(
    path.join(patches, '002-correct.patch'),
    'diff --git a/definitions/unit.json b/definitions/unit.json\n--- a/definitions/unit.json\n+++ b/definitions/unit.json\n@@ -1 +1 @@\n-{"name":"Unit"}\n+{"name":"Corrected"}\n',
  )
  applyPatches(root, patches, 'definitions')

  expect(JSON.parse(fs.readFileSync(path.join(root, 'definitions', 'unit.json'), 'utf8'))).toEqual({ name: 'Corrected' })
})

it('rejects a Marine overlay collision with an upstream catalogue', () => {
  fs.mkdirSync(path.join(root, 'marineCodex'))
  const files = catalogueSources.marineCodex.files!
  for (const file of files) fs.writeFileSync(path.join(root, 'marineCodex', file), '{}')
  fs.writeFileSync(path.join(root, 'definitions', files[0]!), '{"id":"upstream"}')

  expect(() => overlayMarineCodex(root, files)).toThrow('conflicts with BSData')
  expect(JSON.parse(fs.readFileSync(path.join(root, 'definitions', files[0]!), 'utf8'))).toEqual({ id: 'upstream' })
})

it('rejects a Marine overlay missing a pinned file', () => {
  fs.mkdirSync(path.join(root, 'marineCodex'))

  expect(() => overlayMarineCodex(root, catalogueSources.marineCodex.files)).toThrow('is missing')
})

it('rejects an incomplete Marine file inventory', () => {
  expect(() => overlayMarineCodex(root, ['Imperium - Space Marines (11e).json'])).toThrow('file list is incomplete')
})
