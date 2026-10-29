import { expect, it } from 'vitest'
import { dateReleaseHeadings, parseReleaseNotes } from './releaseNotes'

const changelog = `# praetorium

## 0.133.1 (2026-10-28)

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

it('reads each release with its date, features and fixes, without commit prefixes', () => {
  expect(parseReleaseNotes(changelog, 5)).toEqual([
    {
      version: '0.133.1',
      date: '2026-10-28',
      features: [],
      fixes: ["Show each unit's points before and after.", 'Mark saved rosters that use older rules.'],
    },
    { version: '0.133.0', date: null, features: ['Simulate roster loadouts against benchmarks.'], fixes: [] },
    { version: '0.132.9', date: null, features: [], fixes: ['Fix the reminder timer. Keep it running while the screen sleeps.'] },
  ])
})

it('stops at the requested number of releases', () => {
  expect(parseReleaseNotes(changelog, 1).map((release) => release.version)).toEqual(['0.133.1'])
})

it('skips a release with no changes for players', () => {
  const quiet = changelog.replace('## 0.133.0', '## 0.133.2\n\n### Patch Changes\n\n## 0.133.0')
  expect(parseReleaseNotes(quiet, 2).map((release) => release.version)).toEqual(['0.133.1', '0.133.0'])
})

it('dates only the headings that have no date yet', () => {
  expect(dateReleaseHeadings(changelog, '2026-10-29').match(/^## .+$/gm)).toEqual([
    '## 0.133.1 (2026-10-28)',
    '## 0.133.0 (2026-10-29)',
    '## 0.132.9 (2026-10-29)',
  ])
})
