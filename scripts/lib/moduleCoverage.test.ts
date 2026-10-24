import vm from 'node:vm'
import { expect, it } from 'vitest'
import { instrumentModule, moduleCalls } from './moduleCoverage'

// A bundle as Rolldown writes it: application source in `../src/` regions, the SDK elsewhere.
const bundle = `//#region ../src/core/rules.ts
function used() { return 1 }
function unused() { return 2 }
const arrow = () => used()
//#endregion
//#region ../node_modules/spacetimedb/server.js
function sdk() { return 3 }
class Hooks { __call_reducer__() { return arrow() + sdk() } }
function makeHooks(ctx) { return new Hooks() }
class Schema { #ctx = 1; hooks() { return makeHooks(this.#ctx); } }
//#endregion
globalThis.schema = new Schema()
`

function run(code: string, before = '') {
  const lines: string[] = []
  const context = vm.createContext({ console: { log: (line: string) => lines.push(line) } })
  vm.runInContext(`${instrumentModule(code).code}\n${before}`, context)
  vm.runInContext('globalThis.schema.hooks().__call_reducer__()', context)
  return lines
}

it('marks application functions only, by their offsets in the original bundle', () => {
  expect(instrumentModule(bundle).functions.map(([start, end]) => bundle.slice(start, end))).toEqual([
    'function used() { return 1 }',
    'function unused() { return 2 }',
    '() => used()',
  ])
})

it('logs the application functions each call ran', () => {
  expect(run(bundle)).toEqual(['praetorium-coverage 2,0'])
})

it('logs what an instance ran before its first call apart from the call', () => {
  expect(run(bundle, 'unused()')).toEqual(['praetorium-coverage-start 1', 'praetorium-coverage 2,0'])
})

it('refuses a bundle whose call hooks it cannot find', () => {
  expect(() => instrumentModule(bundle.replace('return makeHooks(this.#ctx);', 'return new Hooks();'))).toThrow('to wrap')
})

it('reads each logged call with its time in milliseconds, skipping other log lines', () => {
  const log = (ts: number, message: string) => JSON.stringify({ level: 'Info', ts, message })
  expect(
    moduleCalls([log(2_000, 'praetorium-coverage 2,0'), log(3_000, 'Saved roster'), log(4_000, 'praetorium-coverage-start 1')].join('\n')),
  ).toEqual([
    { at: 2, ids: [2, 0], starting: false },
    { at: 4, ids: [1], starting: true },
  ])
})
