import { expect, it } from 'vitest'
import { declarations, quietHunk, type Hunk } from './quietEdits'

const base = [
  "import { score, undo } from './battle'",
  'import {',
  '  roster,',
  '  type Roster,',
  "} from './roster'",
  "import './polyfill'",
  '',
  'export type Side = {',
  '  name: string',
  '}',
  '',
  'export const limit = 5',
].join('\n')

/** An edit replacing base lines `start`–`end` with `added`, which start at `addedStart` in the head. */
const edit = (start: number, removed: string[], added: string[], addedStart = start): Hunk => ({
  start,
  end: start + Math.max(removed.length, 1) - 1,
  removed,
  added,
  addedStart,
})
const replaced = (line: number, text: string) =>
  base
    .split('\n')
    .with(line - 1, text)
    .join('\n')

it('finds imports, multi-line imports and type declarations at the top level', () => {
  expect(declarations(base).map(({ kind, start, end }) => [kind, start, end])).toEqual([
    ['import', 1, 1],
    ['import', 2, 5],
    ['import', 6, 6],
    ['type', 8, 10],
  ])
})

it('treats an edit to comments alone as quiet', () => {
  expect(quietHunk(edit(7, [''], ['// Why the limit is five.']), base, base)).toBe(true)
})

it('treats adding a binding to an import as quiet', () => {
  const head = replaced(1, "import { score, undo, advance } from './battle'")
  expect(
    quietHunk(edit(1, ["import { score, undo } from './battle'"], ["import { score, undo, advance } from './battle'"]), base, head),
  ).toBe(true)
})

it('treats a type-only member of a multi-line import as quiet', () => {
  const head = base.replace('  type Roster,', '  type Roster,\n  type RosterPick,')
  expect(quietHunk(edit(4, [], ['  type RosterPick,'], 5), base, head)).toBe(true)
})

it('treats an edit inside a type declaration as quiet', () => {
  const head = replaced(9, '  name: string | null')
  expect(quietHunk(edit(9, ['  name: string'], ['  name: string | null']), base, head)).toBe(true)
})

it('does not treat moving a binding to another module as quiet', () => {
  const head = replaced(1, "import { score, undo } from './battleV2'")
  expect(quietHunk(edit(1, ["import { score, undo } from './battle'"], ["import { score, undo } from './battleV2'"]), base, head)).toBe(
    false,
  )
})

it('does not treat a side-effect import as quiet', () => {
  const head = replaced(6, "import './polyfill2'")
  expect(quietHunk(edit(6, ["import './polyfill'"], ["import './polyfill2'"]), base, head)).toBe(false)
})

it('does not treat a top-level value as quiet', () => {
  const head = replaced(12, 'export const limit = 6')
  expect(quietHunk(edit(12, ['export const limit = 5'], ['export const limit = 6']), base, head)).toBe(false)
})

it('does not treat an edit as quiet without both versions of the file', () => {
  expect(quietHunk(edit(1, ["import { score, undo } from './battle'"], ["import { score } from './battle'"]), base, null)).toBe(false)
})

it('does not treat importing from a module the file did not import before as quiet', () => {
  const head = base.replace("import './polyfill'", "import './polyfill'\nimport { clock } from './clock'")
  expect(quietHunk(edit(6, [], ["import { clock } from './clock'"], 7), base, head)).toBe(false)
})

it('does not treat dropping the last import from a module as quiet', () => {
  const head = base.replace("import { score, undo } from './battle'\n", '')
  expect(quietHunk(edit(1, ["import { score, undo } from './battle'"], []), base, head)).toBe(false)
})
