import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { readSharedJson } from './sharedJson'

let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-shared-json-'))
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

function write(name: string, value: string) {
  const file = path.join(directory, name)
  fs.writeFileSync(file, value)
  return file
}

it('reads the same value JSON.parse reads', () => {
  const text = JSON.stringify({ id: 'a', list: ['x', 1, null, true, { scope: 'x', nested: [['y']] }], empty: {}, count: 2 })
  expect(readSharedJson(write('value.json', text))).toEqual(JSON.parse(text))
})

it('keeps a parsed __proto__ key as data', () => {
  const parsed = readSharedJson(write('proto.json', '{"__proto__":"shared","other":"shared"}')) as Record<string, unknown>
  expect([Object.getPrototypeOf(parsed) === Object.prototype, Object.getOwnPropertyDescriptor(parsed, '__proto__')?.value]).toEqual([
    true,
    'shared',
  ])
})

it('collects each distinct string once across files read together', () => {
  const strings = new Map<string, string>()
  readSharedJson(write('one.json', '{"scope":"selections","values":["selections","parent"]}'), strings)
  readSharedJson(write('two.json', '["parent","self"]'), strings)
  expect([...strings.keys()].toSorted()).toEqual(['parent', 'selections', 'self'])
})

it('returns the value already parsed from identical content in another file', () => {
  const text = '{"catalogue":{"id":"book","sharedSelectionEntries":[{"id":"unit"}]}}'
  const kept = readSharedJson(write('current.json', text))
  expect(readSharedJson(write('retained.json', text))).toBe(kept)
})
