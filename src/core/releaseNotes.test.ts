import { expect, it } from 'vitest'
import { parseReleaseNotes } from './releaseNotes'

const changelog = `# praetorium

## 0.133.1

### Patch Changes

- 58f5242: Show each unit's points before and after.
- 4b50468: Mark saved rosters that use older rules.

## 0.133.0

### Minor Changes

- 0919d17: Simulate roster loadouts against benchmarks.

## 0.132.9

- Fix the reminder timer.

  Keep it running while the screen sleeps.
`

it('reads each release with its changes, without commit prefixes', () => {
  expect(parseReleaseNotes(changelog, 5)).toEqual([
    { version: '0.133.1', changes: ["Show each unit's points before and after.", 'Mark saved rosters that use older rules.'] },
    { version: '0.133.0', changes: ['Simulate roster loadouts against benchmarks.'] },
    { version: '0.132.9', changes: ['Fix the reminder timer. Keep it running while the screen sleeps.'] },
  ])
})

it('stops at the requested number of releases', () => {
  expect(parseReleaseNotes(changelog, 1).map((release) => release.version)).toEqual(['0.133.1'])
})
