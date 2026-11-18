import { expect, it } from 'vitest'
import { dateReleaseHeadings, archiveChangelog, parseReleaseNotes, recentReleaseNotes } from './releaseNotes'

const changelog = `# praetorium

## 0.133.1 (2026-10-28)

### Patch Changes

- 58f5242: [rosters] Show each unit's points before and after.
- 4b50468: Mark saved rosters that use older rules.

## 0.133.0

### Minor Changes

- 0919d17: [simulator] Simulate roster loadouts against benchmarks.

## 0.132.9

- Fix the reminder timer.

  Keep it running while the screen sleeps.
`

it('reads each release with its date, features and fixes, without commit prefixes or area tags', () => {
  expect(parseReleaseNotes(changelog, 5)).toEqual([
    {
      version: '0.133.1',
      date: '2026-10-28',
      features: [],
      fixes: [
        { area: 'rosters', text: "Show each unit's points before and after." },
        { area: null, text: 'Mark saved rosters that use older rules.' },
      ],
    },
    { version: '0.133.0', date: null, features: [{ area: 'simulator', text: 'Simulate roster loadouts against benchmarks.' }], fixes: [] },
    {
      version: '0.132.9',
      date: null,
      features: [],
      fixes: [{ area: null, text: 'Fix the reminder timer. Keep it running while the screen sleeps.' }],
    },
  ])
})

it('stops at the requested number of releases', () => {
  expect(parseReleaseNotes(changelog, 1).map((release) => release.version)).toEqual(['0.133.1'])
})

it('skips a release with no changes for players', () => {
  const quiet = changelog.replace('## 0.133.0', '## 0.133.2\n\n### Patch Changes\n\n## 0.133.0')
  expect(parseReleaseNotes(quiet, 2).map((release) => release.version)).toEqual(['0.133.1', '0.133.0'])
})

it('keeps every release from the newest release days', () => {
  expect(recentReleaseNotes(changelog, 1).map((release) => release.version)).toEqual(['0.133.1'])
  expect(recentReleaseNotes(changelog, 2).map((release) => release.version)).toEqual(['0.133.1', '0.133.0', '0.132.9'])
})

it.each([1, 2])('keeps the releases from the newest %i release days in the changelog', (days) => {
  expect(parseReleaseNotes(archiveChangelog(changelog, days).current, Infinity)).toEqual(recentReleaseNotes(changelog, days))
})

it('files each older release under the month it shipped', () => {
  const { archived } = archiveChangelog(changelog.replace('## 0.133.0', '## 0.133.0 (2026-09-30)'), 1)
  expect([...archived].map(([month, text]) => [month, parseReleaseNotes(text, Infinity).map((note) => note.version)])).toEqual([
    ['2026-09', ['0.133.0', '0.132.9']],
  ])
})

it('dates only the headings that have no date yet', () => {
  expect(dateReleaseHeadings(changelog, '2026-10-29').match(/^## .+$/gm)).toEqual([
    '## 0.133.1 (2026-10-28)',
    '## 0.133.0 (2026-10-29)',
    '## 0.132.9 (2026-10-29)',
  ])
})

it('leaves an unknown tag in the text', () => {
  expect(parseReleaseNotes(changelog.replace('[rosters]', '[armies]'), 1)[0]!.fixes[0]).toEqual({
    area: null,
    text: "[armies] Show each unit's points before and after.",
  })
})
