import { expect, it } from 'vitest'
import type { E2eMap } from './e2eMap'
import { changedHunks, lineMoves, selectSpecs, type Contents, type Moves } from './e2eSelection'
import type { Hunk } from './quietEdits'

// `battle.ts` defines `score` on lines 10–20 (called by the battle spec) and `undo` on lines 30–40 (never called).
const map: E2eMap = {
  revision: 'abc',
  specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts', 'e2e/home.spec.ts'],
  files: {
    'src/core/battle.ts': { loaded: [0, 1], functions: [[10, 20, [0]]] },
    'src/client/home.md': { loaded: [2], functions: [] },
    'src/shared/catalogue.ts': { loaded: [0], functions: [] },
  },
  whole: ['src/shared/catalogue.ts'],
}
const none: Moves = new Map()
const unread: Contents = () => ({ base: null, head: null })
/** A code edit replacing base lines `start`–`end`. */
const hunk = (start: number, end: number): Hunk => ({ start, end, removed: ['x()'], added: ['y()'], addedStart: start })
const select = (changes: { file: string; hunks: Hunk[] | null }[], moves = none, contents = unread) =>
  selectSpecs(map, changes, moves, contents)

it('runs only the specs that called a function when an edit stays inside it', () => {
  expect(select([{ file: 'src/core/battle.ts', hunks: [hunk(12, 14)] }])).toEqual({ all: false, specs: ['e2e/battle.spec.ts'] })
})

it('runs every spec that loaded a file when an edit is at its top level', () => {
  expect(select([{ file: 'src/core/battle.ts', hunks: [hunk(2, 3)] }])).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('treats an edit to a function no spec called like a top-level edit', () => {
  expect(select([{ file: 'src/core/battle.ts', hunks: [hunk(32, 33)] }])).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('treats an edit spanning a function boundary as top-level', () => {
  expect(select([{ file: 'src/core/battle.ts', hunks: [hunk(18, 22)] }])).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('follows lines that moved since the map was made back to the map’s numbering', () => {
  // Three lines were added above `score` after the map, so base lines 15–17 are the map's 12–14.
  const moves = new Map([['src/core/battle.ts', [{ oldCount: 0, newStart: 5, newCount: 3 }]]])
  expect(select([{ file: 'src/core/battle.ts', hunks: [hunk(15, 17)] }], moves)).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts'],
  })
})

it('follows lines past a deletion made since the map', () => {
  const moves = new Map([['src/core/battle.ts', [{ oldCount: 2, newStart: 4, newCount: 0 }]]])
  expect(select([{ file: 'src/core/battle.ts', hunks: [hunk(10, 12)] }], moves)).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts'],
  })
})

it('uses every spec that touched a file when the edited lines themselves changed since the map', () => {
  const moves = new Map([['src/core/battle.ts', [{ oldCount: 1, newStart: 13, newCount: 1 }]]])
  expect(select([{ file: 'src/core/battle.ts', hunks: [hunk(12, 14)] }], moves)).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('runs a spec file the change edits, and skips unit tests and documentation', () => {
  expect(
    select([
      { file: 'e2e/roster.spec.ts', hunks: [hunk(1, 2)] },
      { file: 'src/core/battle.test.ts', hunks: [hunk(1, 2)] },
      { file: 'docs/development/battles.md', hunks: [hunk(1, 2)] },
      { file: 'e2e/durations.json', hunks: [hunk(1, 2)] },
    ]),
  ).toEqual({ all: false, specs: ['e2e/roster.spec.ts'] })
})

it.each([
  ['src/core/new.ts', 'src/core/new.ts is not in the map'],
  ['e2e/account.ts', 'e2e/account.ts is outside the application source'],
  ['vite.config.ts', 'vite.config.ts is outside the application source'],
  ['pnpm-lock.yaml', 'pnpm-lock.yaml is outside the application source'],
])('runs every spec when %s changes', (file, reason) => {
  expect(select([{ file, hunks: [hunk(1, 2)] }])).toEqual({ all: true, reason })
})

it('runs every spec when a file the catalogue compiler or a web worker runs changes', () => {
  expect(select([{ file: 'src/shared/catalogue.ts', hunks: [hunk(1, 2)] }])).toEqual({
    all: true,
    reason: 'src/shared/catalogue.ts runs in the catalogue compiler or a web worker',
  })
})

it('runs nothing for an edit that only touches comments', () => {
  const comment: Hunk = { start: 12, end: 12, removed: ['// Old.'], added: ['// New.'], addedStart: 12 }
  expect(select([{ file: 'src/shared/catalogue.ts', hunks: [comment] }])).toEqual({ all: false, specs: [] })
})

it('reads both versions of a file to tell an added import binding apart from code', () => {
  const base = "import { score } from './score'\n"
  const head = "import { score, undo } from './score'\n"
  const edit: Hunk = { start: 1, end: 1, removed: [base.trim()], added: [head.trim()], addedStart: 1 }
  expect(select([{ file: 'src/core/battle.ts', hunks: [edit] }], none, () => ({ base, head }))).toEqual({ all: false, specs: [] })
})

it('runs nothing for a change no spec can reach', () => {
  expect(select([{ file: 'src/core/battle.test.ts', hunks: [hunk(1, 2)] }])).toEqual({ all: false, specs: [] })
})

it('reads base-side spans, including insertions and whole-file changes, from a zero-context diff', () => {
  const diff = [
    'diff --git a/src/core/battle.ts b/src/core/battle.ts',
    'index 1..2 100644',
    '--- a/src/core/battle.ts',
    '+++ b/src/core/battle.ts',
    '@@ -12,3 +12,4 @@ export function score() {',
    '-a',
    '-b',
    '-c',
    '+a',
    '+b',
    '+c',
    '+d',
    '@@ -25,0 +27,2 @@',
    '+e',
    '+f',
    '@@ -40 +43 @@',
    '-g',
    '+h',
    'diff --git a/src/core/new.ts b/src/core/new.ts',
    'new file mode 100644',
    '@@ -0,0 +1,3 @@',
  ].join('\n')
  expect(changedHunks(diff)).toEqual([
    {
      file: 'src/core/battle.ts',
      hunks: [
        { start: 12, end: 14, removed: ['a', 'b', 'c'], added: ['a', 'b', 'c', 'd'], addedStart: 12 },
        { start: 25, end: 26, removed: [], added: ['e', 'f'], addedStart: 27 },
        { start: 40, end: 40, removed: ['g'], added: ['h'], addedStart: 43 },
      ],
    },
    { file: 'src/core/new.ts', hunks: null },
  ])
})

it('reads how lines moved since the map from a zero-context diff', () => {
  const diff = [
    'diff --git a/src/core/battle.ts b/src/core/battle.ts',
    '@@ -4,0 +5,3 @@',
    '@@ -20,2 +23 @@',
    'diff --git a/src/gone.ts b/src/gone.ts',
    'deleted file mode 100644',
  ].join('\n')
  expect([...lineMoves(diff)]).toEqual([
    [
      'src/core/battle.ts',
      [
        { oldCount: 0, newStart: 5, newCount: 3 },
        { oldCount: 2, newStart: 23, newCount: 1 },
      ],
    ],
    ['src/gone.ts', null],
  ])
})
