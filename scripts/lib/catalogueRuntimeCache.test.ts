import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { system } from '../../src/server/catalogue.fixtures'
import { writeCatalogueRuntime } from './catalogueRuntime'
import { prepareCatalogueRuntime } from './catalogueRuntimeCache'

let directory: string
let cacheRoot: string
let output: string
const compile = vi.fn(async (source: string, target: string) => writeCatalogueRuntime(source, target))
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-runtime-cache-'))
  cacheRoot = path.join(directory, 'cache')
  output = path.join(directory, 'output', 'catalogue-runtime')
  fs.mkdirSync(path.join(directory, 'definitions'))
  fs.writeFileSync(path.join(directory, 'definitions', 'system.json'), JSON.stringify(system))
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'authored-test' }))
  compile.mockClear()
})
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('prepares the runtime once and restores it for the next build', async () => {
  const first = await prepareCatalogueRuntime(directory, output, cacheRoot, compile)
  fs.rmSync(output, { recursive: true })
  const second = await prepareCatalogueRuntime(directory, output, cacheRoot, compile)
  expect({ first, second, compiled: compile.mock.calls.length, restored: fs.existsSync(path.join(output, 'startup.json')) }).toEqual({
    first: 'prepared',
    second: 'cached',
    compiled: 1,
    restored: true,
  })
})

it('prepares again after the snapshot changes', async () => {
  await prepareCatalogueRuntime(directory, output, cacheRoot, compile)
  fs.writeFileSync(path.join(directory, 'revision.json'), JSON.stringify({ definitions: 'changed' }))
  const result = await prepareCatalogueRuntime(directory, output, cacheRoot, compile)
  expect({ result, compiled: compile.mock.calls.length }).toEqual({ result: 'prepared', compiled: 2 })
})

it('discards a cached runtime that fails verification', async () => {
  await prepareCatalogueRuntime(directory, output, cacheRoot, compile)
  const [entry] = fs.readdirSync(cacheRoot)
  fs.appendFileSync(path.join(cacheRoot, entry!, 'startup.json'), ' ')
  const result = await prepareCatalogueRuntime(directory, output, cacheRoot, compile)
  expect({ result, compiled: compile.mock.calls.length, entries: fs.readdirSync(cacheRoot) }).toEqual({
    result: 'prepared',
    compiled: 2,
    entries: [entry],
  })
})

it('prepares without storing when the cache is off', async () => {
  const result = await prepareCatalogueRuntime(directory, output, null, compile)
  expect({ result, cache: fs.existsSync(cacheRoot) }).toEqual({ result: 'prepared', cache: false })
})
