import { expect, it } from 'vitest'
import type { E2eMap } from './e2eMap'
import { changedHunks, selectSpecs } from './e2eSelection'

// `battle.ts` defines `score` on lines 10–20 (called by the battle spec) and `undo` on lines 30–40 (never called).
const map: E2eMap = {
  revision: 'abc',
  specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts', 'e2e/home.spec.ts'],
  files: {
    'src/core/battle.ts': { loaded: [0, 1], functions: [[10, 20, [0]]] },
    'src/client/home.md': { loaded: [2], functions: [] },
  },
}
const none = new Set<string>()

it('runs only the specs that called a function when an edit stays inside it', () => {
  expect(selectSpecs(map, [{ file: 'src/core/battle.ts', hunks: [[12, 14]] }], none)).toEqual({ all: false, specs: ['e2e/battle.spec.ts'] })
})

it('runs every spec that loaded a file when an edit is at its top level', () => {
  expect(selectSpecs(map, [{ file: 'src/core/battle.ts', hunks: [[2, 3]] }], none)).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('treats an edit to a function no spec called like a top-level edit', () => {
  expect(selectSpecs(map, [{ file: 'src/core/battle.ts', hunks: [[32, 33]] }], none)).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('treats an edit spanning a function boundary as top-level', () => {
  expect(selectSpecs(map, [{ file: 'src/core/battle.ts', hunks: [[18, 22]] }], none)).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('uses every spec that touched a file whose lines moved since the map was made', () => {
  expect(selectSpecs(map, [{ file: 'src/core/battle.ts', hunks: [[12, 14]] }], new Set(['src/core/battle.ts']))).toEqual({
    all: false,
    specs: ['e2e/battle.spec.ts', 'e2e/roster.spec.ts'],
  })
})

it('runs a spec file the change edits, and skips unit tests and documentation', () => {
  expect(
    selectSpecs(
      map,
      [
        { file: 'e2e/roster.spec.ts', hunks: [[1, 2]] },
        { file: 'src/core/battle.test.ts', hunks: [[1, 2]] },
        { file: 'docs/development/battles.md', hunks: [[1, 2]] },
        { file: 'e2e/durations.json', hunks: [[1, 2]] },
      ],
      none,
    ),
  ).toEqual({ all: false, specs: ['e2e/roster.spec.ts'] })
})

it.each([
  ['src/core/new.ts', 'src/core/new.ts is not in the map'],
  ['e2e/account.ts', 'e2e/account.ts is outside the application source'],
  ['vite.config.ts', 'vite.config.ts is outside the application source'],
  ['pnpm-lock.yaml', 'pnpm-lock.yaml is outside the application source'],
])('runs every spec when %s changes', (file, reason) => {
  expect(selectSpecs(map, [{ file, hunks: [[1, 2]] }], none)).toEqual({ all: true, reason })
})

it('runs nothing for a change no spec can reach', () => {
  expect(selectSpecs(map, [{ file: 'src/core/battle.test.ts', hunks: [[1, 2]] }], none)).toEqual({ all: false, specs: [] })
})

it('reads base-side spans, including insertions and whole-file changes, from a zero-context diff', () => {
  const diff = [
    'diff --git a/src/core/battle.ts b/src/core/battle.ts',
    'index 1..2 100644',
    '--- a/src/core/battle.ts',
    '+++ b/src/core/battle.ts',
    '@@ -12,3 +12,4 @@ export function score() {',
    '@@ -25,0 +27,2 @@',
    '@@ -40 +43 @@',
    'diff --git a/src/core/new.ts b/src/core/new.ts',
    'new file mode 100644',
    '@@ -0,0 +1,3 @@',
  ].join('\n')
  expect(changedHunks(diff)).toEqual([
    {
      file: 'src/core/battle.ts',
      hunks: [
        [12, 14],
        [25, 26],
        [40, 40],
      ],
    },
    { file: 'src/core/new.ts', hunks: null },
  ])
})
