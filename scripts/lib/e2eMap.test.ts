import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { buildE2eMap, scriptReader, workerSources } from './e2eMap'

let root: string
let build: string
// Two modules bundled into one chunk: `a` from src/a.ts line 1, `b` from src/b.ts line 3.
const code = 'function a(){return 1}\nfunction b(){return 2}\n'
const offsetOf = (name: string) => code.indexOf(`function ${name}`)

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-e2e-map-'))
  build = path.join(root, 'build')
  fs.mkdirSync(path.join(build, 'public/assets'), { recursive: true })
  fs.writeFileSync(path.join(build, 'public/assets/chunk.js'), code)
  fs.writeFileSync(
    path.join(build, 'public/assets/chunk.js.map'),
    JSON.stringify({
      version: 3,
      // Written as the build does: relative to a temporary directory, then absolute.
      sources: [`../../../..${root}/src/a.ts`, `../../../..${root}/src/b.ts`, '../../node_modules/react/index.js'],
      names: [],
      mappings: 'AAAA;ACEA',
    }),
  )
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const url = 'http://127.0.0.1:4171/assets/chunk.js'
const call = (name: string) => ({ url, start: offsetOf(name), end: offsetOf(name) + 22 })

it('records the source line of each executed function and the specs that called it', () => {
  const map = buildE2eMap(
    [
      { spec: 'e2e/one.spec.ts', client: [call('a')], server: [] },
      { spec: 'e2e/two.spec.ts', client: [call('a'), call('b')], server: [] },
    ],
    scriptReader(build, root),
    root,
    'abc',
  )
  expect(map.files).toEqual({
    'src/a.ts': { loaded: [0, 1], functions: [[1, 1, [0, 1]]] },
    'src/b.ts': { loaded: [0, 1], functions: [[3, 3, [1]]] },
  })
})

it('counts a loaded script for every module in it, without inventing a function for its top level', () => {
  const map = buildE2eMap(
    [{ spec: 'e2e/one.spec.ts', client: [{ url, start: 0, end: code.length }], server: [] }],
    scriptReader(build, root),
    root,
    'abc',
  )
  expect(map.files).toEqual({ 'src/a.ts': { loaded: [0], functions: [] }, 'src/b.ts': { loaded: [0], functions: [] } })
})

it('treats tests of one spec file as one spec', () => {
  const map = buildE2eMap(
    [
      { spec: 'e2e/one.spec.ts', client: [call('a')], server: [] },
      { spec: 'e2e/one.spec.ts', client: [call('b')], server: [] },
    ],
    scriptReader(build, root),
    root,
    'abc',
  )
  expect(map.specs).toEqual(['e2e/one.spec.ts'])
})

it('reads a server script from the build by its path under a stack’s copy', () => {
  fs.mkdirSync(path.join(build, 'server/chunks'), { recursive: true })
  fs.copyFileSync(path.join(build, 'public/assets/chunk.js'), path.join(build, 'server/chunks/chunk.mjs'))
  fs.copyFileSync(path.join(build, 'public/assets/chunk.js.map'), path.join(build, 'server/chunks/chunk.mjs.map'))
  const server = { url: 'file:///tmp/praetorium-e2e-x/build/server/chunks/chunk.mjs', start: offsetOf('b'), end: offsetOf('b') + 22 }
  const map = buildE2eMap([{ spec: 'e2e/one.spec.ts', client: [], server: [server] }], scriptReader(build, root), root, 'abc')
  expect(map.files['src/b.ts']?.functions).toEqual([[3, 3, [0]]])
})

it('ignores scripts without a source map', () => {
  const map = buildE2eMap(
    [{ spec: 'e2e/one.spec.ts', client: [{ url: 'http://127.0.0.1:4171/assets/runtime.js', start: 5, end: 9 }], server: [] }],
    scriptReader(build, root),
    root,
    'abc',
  )
  expect(map.files).toEqual({})
})

it('spans a function to the last line its body maps to when its closing brace has no mapping', () => {
  // Server bundles keep each statement on its own line; this one maps lines 1–2 to src/a.ts 5–6.
  const body = 'function c(){\nreturn 3\n}\n'
  fs.mkdirSync(path.join(build, 'server'), { recursive: true })
  fs.writeFileSync(path.join(build, 'server/c.mjs'), body)
  fs.writeFileSync(
    path.join(build, 'server/c.mjs.map'),
    JSON.stringify({ version: 3, sources: [`../../../..${root}/src/a.ts`], names: [], mappings: 'AAIA;AACA' }),
  )
  const server = { url: 'file:///tmp/praetorium-e2e-x/build/server/c.mjs', start: 0, end: body.length - 1 }
  const map = buildE2eMap([{ spec: 'e2e/one.spec.ts', client: [], server: [server] }], scriptReader(build, root), root, 'abc')
  expect(map.files['src/a.ts']?.functions).toEqual([[5, 6, [0]]])
})

it('lists the application source in web worker chunks', () => {
  fs.copyFileSync(path.join(build, 'public/assets/chunk.js.map'), path.join(build, 'public/assets/sim.worker-Ab1_c.js.map'))
  expect(workerSources(build, root)).toEqual(['src/a.ts', 'src/b.ts'])
})
