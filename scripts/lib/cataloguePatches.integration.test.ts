import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { applyPatches } from './cataloguePatches'

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
