import { describe, expect, it } from 'vitest'
import { groupedEntries, groupsPage } from './rosterGrouping'

const entry = (id: string, group: string, variant = false) => ({ roster: { id, group }, variant })
const groupOf = (roster: { group: string }) => ({ key: roster.group, label: roster.group, rank: roster.group === 'none' ? 1 : 0 })
const ids = (groups: ReturnType<typeof groupedEntries<{ id: string; group: string }>>) =>
  groups.map(({ group, entries }) => `${group.label}: ${entries.map(({ roster }) => roster.id).join(' ')}`)

describe('grouped roster entries', () => {
  it('keeps a variant under its base even when the variant belongs to another group', () => {
    expect(ids(groupedEntries([entry('a', 'Orks'), entry('b', 'Necrons', true), entry('c', 'Necrons')], groupOf))).toEqual([
      'Necrons: c',
      'Orks: a b',
    ])
  })

  it('puts a lower rank first whatever the label says', () => {
    expect(ids(groupedEntries([entry('a', 'none'), entry('b', 'Tau')], groupOf))).toEqual(['Tau: b', 'none: a'])
  })
})

describe('a page of roster groups', () => {
  const run = (key: string, size: number) => ({
    group: { key, label: key, rank: 0 },
    entries: Array.from({ length: size }, (_, index) => ({ roster: `${key}${index}`, variant: false })),
  })
  const shown = (page: ReturnType<typeof groupsPage<string>>) => page.shown.map(({ group, entries }) => `${group.key}${entries.length}`)

  it('spends none of the page on a collapsed group', () => {
    expect(shown(groupsPage([run('a', 3), run('b', 2)], (key) => key === 'a', 2))).toEqual(['a0', 'b2'])
  })

  it('stops at the first group cut short, hiding collapsed groups after it', () => {
    expect(shown(groupsPage([run('a', 3), run('b', 2), run('c', 1)], (key) => key === 'c', 2))).toEqual(['a2'])
  })
})
