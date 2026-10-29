import { expect, it } from 'vitest'
import { seenRelease, unseenReleases } from './seenRelease'

const note = (version: string) => ({ version, date: '2026-10-28', features: [], fixes: [version] })
const notes = [note('0.134.0'), note('0.133.1'), note('0.133.0')]

it('lists the releases after the acknowledged version up to the running one', () => {
  expect(unseenReleases(notes, '0.133.0', '0.133.1').map((release) => release.version)).toEqual(['0.133.1'])
})

it('reads a version stored before acknowledgements had a time as unacknowledged', () => {
  expect(seenRelease('0.133.0')).toBeNull()
})
